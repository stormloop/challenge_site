from pydantic import BaseModel
from typing import List, Set, Tuple

from models.challenge import ChallengeType
from models.challenge_instance import ChallengeInstance, ChallengeInstanceStatus
from models.game_participant import GameParticipant

# A game is an ongoing set of challenges available to a set of participants.
class GameUpDownload(BaseModel):
    game_uuid: str
    name: str
    participant_uuids: Set[str]
    supported_challenge_uuids: Set[str]
    
    def __hash__(self):
        return int(self.game_uuid)

# A game is an ongoing set of challenges available to a set of participants.
class Game(BaseModel):
    game_uuid: int
    name: str
    participant_uuids: Set[int]
    supported_challenge_uuids: Set[int]

    def get_leaderboard(self, db) -> List[Tuple[int, int]]:
        participants: dict[int, GameParticipant] = db.get_game_participants(self.game_uuid)
        challenge_instances: dict[int, ChallengeInstance] = db.get_challenge_instances(self.game_uuid)
        leaderboard: List[Tuple[int, int]] = []
        for participant in participants.values():
            approved_challenge_instances: List[ChallengeInstance] = [instance for instance in challenge_instances.values() 
                                                                        if instance.challenge_instance_uuid in participant.challenge_instance_uuids \
                                                                            and (instance.status == ChallengeInstanceStatus.approved or
                                                                                 db.get_challenge(self.game_uuid, instance.challenge_uuid).type == ChallengeType.Contest) \
                                                                                and len(instance.participant_uuids) >= db.get_challenge(self.game_uuid, instance.challenge_uuid).min_players]
            points = [approved_instance.get_points_awarded(participant, self.game_uuid, db) for approved_instance in approved_challenge_instances]
            leaderboard.append([participant.user_uuid, sum(points)])
        # Sort by descending points.
        leaderboard = sorted(leaderboard, key=lambda entry: entry[1], reverse=True)
        return leaderboard

    def to_endpoint_representation(self) -> GameUpDownload:
        keys = self.model_dump()
        keys["game_uuid"] = str(self.game_uuid)
        keys["participant_uuids"] = set([str(val) for val in self.participant_uuids])
        keys["supported_challenge_uuids"] = set([str(val) for val in self.supported_challenge_uuids])
        return GameUpDownload(**keys)

    @classmethod
    def from_endpoint_representation(cls, endpoint_representation: GameUpDownload):
        keys = endpoint_representation.model_dump()
        keys["game_uuid"] = int(endpoint_representation.game_uuid)
        keys["participant_uuids"] = set([int(val) for val in endpoint_representation.participant_uuids])
        keys["supported_challenge_uuids"] = set([int(val) for val in endpoint_representation.supported_challenge_uuids])
        return Game(**keys)

    
    def __hash__(self):
        return self.game_uuid