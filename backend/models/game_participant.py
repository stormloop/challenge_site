from pydantic import BaseModel

from typing import Set

from models.user import UserUpDownload

# A game participant is the data of a user in a game.
# Any reference to a challenge, is to a ChallengeInstance object.
class GameParticipantUpDownload(BaseModel):
    user: UserUpDownload
    has_admin_permissions: bool
    challenge_instance_uuids: Set[str]

    def __hash__(self):
        return int(self.user_uuid)

# A game participant is the data of a user in a game.
# Any reference to a challenge, is to a ChallengeInstance object.
class GameParticipant(BaseModel):
    user_uuid: int
    is_admin: bool
    challenge_instance_uuids: Set[int]

    def to_endpoint_representation(self, db) -> GameParticipantUpDownload:
        keys = self.model_dump()
        keys["user"] = db.get_user(keys.pop("user_uuid")).to_endpoint_representation()
        keys["has_admin_permissions"] = keys.pop("is_admin")
        keys["challenge_instance_uuids"] = set([str(val) for val in self.challenge_instance_uuids])
        return GameParticipantUpDownload(**keys)

    @classmethod
    def from_endpoint_representation(cls, endpoint_representation):
        keys = endpoint_representation.model_dump()
        keys["user_uuid"] = int(endpoint_representation.user.user_uuid)
        keys.pop("user")
        keys["challenge_instance_uuids"] = set([str(val) for val in endpoint_representation.challenge_instance_uuids])
        keys["is_admin"] = keys.pop("has_admin_permissions")
        return GameParticipant(**keys)

    def __hash__(self):
        return self.user_uuid