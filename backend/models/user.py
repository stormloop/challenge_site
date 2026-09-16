from typing import Set

from pydantic import BaseModel


# A user is the account of a person. It can participate in multiple games.
class UserUpDownload(BaseModel):
    user_uuid: str
    username: str
    is_global_admin: bool
    location: str  # The real world location the user is usually at.
    game_uuids: Set[str]  # The Games this user is a part of.
    # The profile picture is shared independently.
    # The auth0_subject_id is not shared externally.

    def __hash__(self):
        return int(self.user_uuid)

class User(BaseModel):
    user_uuid: int
    auth0_subject_id: str
    is_global_admin: bool  # Whether the user can perform admin actions.
    username: str
    pfp_path: str | None
    location: str  # The real world location the user is usually at.
    game_uuids: Set[int]  # The Games this user is a part of.

    # def to_endpoint_representation(self) -> UserUpDownload:
    #     endpoint_representation = UserUpDownload(user_uuid=str(self.user_uuid), is_global_admin=self.is_global_admin, username=self.username, location=self.location, game_uuids=self.game_uuids)
    #     return endpoint_representation

    def to_endpoint_representation(self) -> UserUpDownload:
        keys = self.model_dump()
        keys["user_uuid"] = str(self.user_uuid)
        keys["game_uuids"] = set([str(val) for val in self.game_uuids])
        return UserUpDownload(**keys)

    @classmethod
    def from_endpoint_representation(cls, endpoint_representation: UserUpDownload):
        keys = endpoint_representation.model_dump()
        keys["user_uuid"] = int(endpoint_representation.user_uuid)
        keys["game_uuids"] = set([int(val) for val in endpoint_representation.game_uuids])
        keys["pfp_path"] = "_INVALID_PFP_PATH_"
        keys["auth0_subject_id"] = "_INVALID_AUTH0_SUBJECT_ID_"
        return User(**keys)
    
    def __hash__(self):
        return self.user_uuid