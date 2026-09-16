from pydantic import BaseModel, PositiveInt

from datetime import datetime
from typing import List, Set, Tuple
from enum import IntEnum

from models.challenge import ChallengeType, ChallengeUpDownload
from models.game_participant import GameParticipant

from leaderboard_parser import order_challenge_leaderboard


class ChallengeInstanceStatus(IntEnum):
    ongoing = 0
    under_review = 1
    times_up = 2
    approved = 3
    failed = 4

class ChallengeInstanceUpDownload(BaseModel):
    challenge_instance_uuid: str # The uuid of this ChallengeInstance.
    challenge: ChallengeUpDownload  # The uuid of the Challenge this ChallengeInstance is based on.
    participant_uuids: Set[str]  # The GameParticipants taking part in this challenge.
    challenge_submission_uuids: Set[str] | None  # The submissions that have been made by participants to this challenge.
    start_time: str  # The time at which this challenge was started, in utc timezone.
    complete_time: str | None  # Time of completion in utc timezone, None if the ChallengeInstance is still in progress.
    status: ChallengeInstanceStatus

    overwrite_points: list[int] | None  # The amount of points actually rewarded to the players, if not None, otherwise, the standard amount form the Challenge is used. This is to allow extra points to be awarded by an admin, for example for extra effort.
    leaderboard: List[Tuple[str, str]] | None  # For contests only, maps leaderboard position onto participant_uuids onto their points total (in this challenge)
    overwrite_leaderboard_to_manual: bool  # For contests only.

    def __hash__(self):
        return int(self.challenge_instance_uuid)

# A challenge instance is a challenge that is in progress.
class ChallengeInstance(BaseModel):
    challenge_instance_uuid: int # The uuid of this ChallengeInstance.
    game_uuid: int  # The uuid of the Game this ChallengeInstance is in.
    challenge_uuid: int  # The uuid of the Challenge this ChallengeInstance is based on.
    participant_uuids: Set[int]  # The GameParticipants taking part in this challenge.
    challenge_submission_uuids: Set[int]  # The submissions that have been made by participants to this challenge.
    start_time: datetime  # The time at which this challenge was started, in utc timezone.
    complete_time: datetime | None  # Time of completion in utc timezone, None if the ChallengeInstance is still in progress.
    status: ChallengeInstanceStatus
    
    overwrite_points: list[int] | None  # The amount of points actually rewarded to the players, if not None, otherwise, the standard amount form the Challenge is used. This is to allow extra points to be awarded by an admin, for example for extra effort.
    leaderboard: List[Tuple[int, str]] | None  # For contests only, maps leaderboard position onto participant_uuids onto their points total (in this challenge)
    overwrite_leaderboard_to_manual: bool  # For contests only.

    # Updates its own leaderboard ranking, but does not save the result to disk.
    def update_leaderboard(self, participants, challenge, submissions):
        if challenge.type != ChallengeType.Contest:
            self.leaderboard = None
            return
        
        self.leaderboard = [[entry, ""] for entry in order_challenge_leaderboard(participants=participants,
                                                       challenge=challenge,
                                                       challenge_instance=self,
                                                       challenge_submissions=submissions)]

    def get_points_awarded(self, participant: GameParticipant, game_uuid, db) -> int:
        if participant.user_uuid not in self.participant_uuids:
            return 0
        if db.get_challenge(game_uuid, self.challenge_uuid).type == ChallengeType.Contest:
            leaderboard_index = -1
            for i in range(len(self.leaderboard)):
                if self.leaderboard[i][0] == participant.user_uuid:
                    leaderboard_index = i
            if leaderboard_index == -1:
                raise Exception("Participant not found in leaderboard")
            return self.overwrite_points[leaderboard_index] if self.overwrite_points is not None else db.get_challenge(game_uuid, self.challenge_uuid).points_rewarded[leaderboard_index]
        return self.overwrite_points[0] if self.overwrite_points is not None else db.get_challenge(game_uuid, self.challenge_uuid).points_rewarded[0]


    # ChallengeInstances are visible if the viewer is an admin, if they are partaking in the ChallengeInstance, or if the ChallengeInstance is approved or failed.
    def is_visible_by(self, viewer: GameParticipant):
        return viewer.user_uuid in self.participant_uuids or self.status == ChallengeInstanceStatus.approved or self.status == ChallengeInstanceStatus.failed or self.status == ChallengeInstanceStatus.times_up

    def is_joinable_by(self, viewer: GameParticipant, game_uuid: int, db):
        return viewer.user_uuid not in self.participant_uuids \
                and self.status == ChallengeInstanceStatus.ongoing \
                and db.get_challenge(game_uuid, self.challenge_uuid).is_joinable_by(viewer, game_uuid, db) \
                and len(self.participant_uuids) < db.get_challenge(game_uuid, self.challenge_uuid).max_players

    def to_endpoint_representation(self, viewer: GameParticipant, game_uuid, db) -> ChallengeInstanceUpDownload:
        keys = self.model_dump()
        keys["challenge_instance_uuid"] = str(self.challenge_instance_uuid)
        keys.pop("game_uuid")
        keys.pop("challenge_uuid")
        keys["challenge"] = db.get_challenge(self.game_uuid, self.challenge_uuid).to_endpoint_representation(viewer, game_uuid, db)
        keys["participant_uuids"] = set([str(val) for val in self.participant_uuids])
        keys["challenge_submission_uuids"] = None if len(self.challenge_submission_uuids) == 0 else set([str(val) for val in self.challenge_submission_uuids])
        keys["start_time"] = self.start_time.isoformat()
        keys["complete_time"] = self.complete_time.isoformat() if self.complete_time is not None else None

        if db.get_challenge(game_uuid, self.challenge_uuid).type != ChallengeType.Contest:
            keys["leaderboard"] = None
        else:
            keys["leaderboard"] = [[str(value[0]), value[1]] for value in self.leaderboard]

        return ChallengeInstanceUpDownload(**keys)

    @classmethod
    def from_endpoint_representation(cls, challenge_instance: ChallengeInstanceUpDownload):
        keys = challenge_instance.model_dump()
        keys["game_uuid"] = int(challenge_instance.challenge.game_uuid)
        keys["challenge_uuid"] = int(challenge_instance.challenge.challenge_uuid)
        keys["challenge_instance_uuid"] = int(challenge_instance.challenge_instance_uuid)
        keys["participant_uuids"] = set(int(value) for value in challenge_instance.participant_uuids)
        keys["challenge_submission_uuids"] = set() if challenge_instance.challenge_submission_uuids is None else set(int(value) for value in challenge_instance.challenge_submission_uuids)
        keys["start_time"] = datetime.fromisoformat(challenge_instance.start_time)
        keys["complete_time"] = datetime.fromisoformat(challenge_instance.complete_time) if challenge_instance.complete_time is not None else None
        keys.pop("challenge")

        if "leaderboard" in keys:
            keys["leaderboard"] = [[int(value[0]), value[1]] for value in keys["leaderboard"]] if keys["leaderboard"] is not None else None

        return ChallengeInstance(**keys)

    def __hash__(self):
        return self.challenge_instance_uuid