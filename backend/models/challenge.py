from enum import IntEnum

from pydantic import BaseModel, PositiveInt

from datetime import datetime, timedelta
from typing import List

from models.game_participant import GameParticipant

from availability_parser import is_challenge_available

class ChallengeType(IntEnum):
    Solo = 0,
    Coop = 1,
    Contest = 2

class ContestEntryType(IntEnum):
    NONE = 0,  # Used if there is no data type associated with each submission, but the number of submissions is counted instead, or the submission date, etc.
    Integer = 1,
    Float = 2,


class ChallengeUpDownload(BaseModel):
    type: ChallengeType
    challenge_uuid: str
    game_uuid: str
    name: str
    description: str
    availability_conditions: str  # A string representing if this challenge should be showed to/can be started by a certain user.
    points_rewarded: List[int]  # Points rewarded upon completion.
    repeatable: bool  # Whether a participant can complete this challenge multiple times.
    joinable: bool  # uuids of joinable challenge instances. Is not the challenge instance itself to avoid circular JSON references.
    startable: bool  # Whether the participant can start this challenge themselves.

    min_players: PositiveInt = 1
    max_players: PositiveInt = 1
    
    leaderboard_ordering: str | None  # Only for contests, describes how it is decided who gets which leaderboard place in this challenge.
    contest_entry_type: ContestEntryType | None  # Only for contests, describes the data type used to decide who is in what place in this challenge.

    time_period_limit: timedelta | None
    time_date_limit: datetime | None

    def __hash__(self):
        return int(self.challenge_uuid)
    


# A challenge is a way for participants to earn points.
class Challenge(BaseModel):
    # Standard fields.
    type: ChallengeType
    challenge_uuid: int
    game_uuid: int
    name: str
    description: str
    availability_conditions: str  # A string representing if this challenge should be showed to/can be started by a certain user.
    points_rewarded: List[int]  # Points rewarded upon completion.
    repeatable: bool  # Whether a participant can complete this challenge multiple times.

    min_players: PositiveInt = 1
    max_players: PositiveInt = 1
    
    leaderboard_ordering: str | None  # Only for contests, describes how it is decided who gets which leaderboard place in this challenge.
    contest_entry_type: ContestEntryType | None  # Only for contests, describes the data type used to decide who is in what place in this challenge.

    time_limit: datetime | timedelta | None  # A datetime by which time the challenge should be finished, or a timedelta to determine how much time the participant gets. datetime is in utc timezone.

    def fulfills_availability_conditions(self, participant: GameParticipant, db):
        available = is_challenge_available(
            game=db.get_game(self.game_uuid),
            user=db.get_user(participant.user_uuid),
            participant=participant,
            challenge=self,
            challenges=db.get_challenges(self.game_uuid).values(),
            challenge_instances=db.get_challenge_instances(self.game_uuid).values()
        )
        return available

    def is_visible_by(self, participant: GameParticipant, db):
        return self.is_startable_by(participant, self.game_uuid, db) or self.is_joinable_by(participant, self.game_uuid, db)
    
    # Challenges are startable if the viewer is an admin, if they fulfill the availability_conditions and if they have not already started the challenge instance (unless it is completed and repeatable, or it is not a solo assignment and repeatable).
    def is_startable_by(self, participant: GameParticipant, game_uuid: int, db):
        if not self.fulfills_availability_conditions(participant, db):
            return False
        
        challenge_instances = [value for value in db.get_challenge_instances(game_uuid).values() if value.challenge_instance_uuid in participant.challenge_instance_uuids]
        started_challenge_uuids= [instance.challenge_uuid for instance in challenge_instances if int(instance.status) == 0]  # status == Ongoing.
        if self.challenge_uuid in started_challenge_uuids:
            if self.type == ChallengeType.Solo:
                return False
            return self.repeatable
        finished_challenge_uuids = [instance.challenge_uuid for instance in challenge_instances if int(instance.status) != 0]  # status == Ongoing.
        if self.challenge_uuid in finished_challenge_uuids:
            return self.repeatable
        return True

    # Returns if the participant could join challenge instances, no matter if there are any available or not.    
    def is_joinable_by(self, participant: GameParticipant, game_uuid: int, db):
        return self.is_startable_by(participant, game_uuid, db)

    def get_joinable_challenge_instances(self, participant: GameParticipant, game_uuid: int, db):
        if self.type == ChallengeType.Solo or not self.is_joinable_by(participant, game_uuid, db):
            return []
        else:
            return [instance for instance in db.get_challenge_instances(game_uuid).values() \
                                                if instance.challenge_uuid == self.challenge_uuid and instance.is_joinable_by(participant, game_uuid, db)]


    def to_endpoint_representation(self, participant: GameParticipant, game_uuid: int, db) -> ChallengeUpDownload:
        keys = self.model_dump()
        keys["challenge_uuid"] = str(self.challenge_uuid)
        keys["game_uuid"] = str(self.game_uuid)
        keys.pop("time_limit")
        keys["time_period_limit"] = str(self.time_limit) if self.time_limit is not None and isinstance(self.time_limit, timedelta) else None
        keys["time_date_limit"] = self.time_limit.isoformat() if self.time_limit is not None and isinstance(self.time_limit, datetime) else None

        keys["startable"] = self.is_startable_by(participant, game_uuid, db)
        keys["joinable"] = self.is_joinable_by(participant, game_uuid, db) and len(self.get_joinable_challenge_instances(participant, game_uuid, db)) > 0

        keys["leaderboard_ordering"] = None
        keys["contest_entry_type"] = None

        return ChallengeUpDownload(**keys)

    @classmethod
    def from_endpoint_representation(cls, endpoint_representation: ChallengeUpDownload):
        keys = endpoint_representation.model_dump()
        keys["challenge_uuid"] = str(endpoint_representation.challenge_uuid)
        keys["game_uuid"] = str(endpoint_representation.game_uuid)
        keys.pop("time_period_limit")
        keys.pop("time_date_limit")
        keys["time_limit"] = datetime.fromisoformat(endpoint_representation["time_date_limit"]) if endpoint_representation["time_date_limit"] is not None \
                                else None
        if endpoint_representation["time_date_limit"] is None:
            raise Exception("Did not implement timedelta parsing")
        keys.pop("startable")
        keys.pop("joinable")
        return Challenge(**keys)


    def __hash__(self):
        return self.challenge_uuid
