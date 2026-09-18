from datetime import datetime, timezone
import os
import json
from typing import Annotated, Dict, List, Set, Tuple

from fastapi import Depends, FastAPI, Form
from fastapi.middleware.cors import CORSMiddleware  # To allow the frontend to access the backend.
from fastapi import UploadFile  # For uploading files.
from fastapi.responses import FileResponse
from fastapi_batch import BatchGateway, BatchResponse  # For downloading files.

from utils.files import get_file_type
from utils.dependencies import has_admin_enabled, has_admin_permissions
from models.user import User, UserUpDownload
from models.game import Game, GameUpDownload
from models.game_participant import GameParticipant, GameParticipantUpDownload
from models.challenge import Challenge, ChallengeUpDownload
from models.challenge_submission import ChallengeSubmissionUpload, ChallengeSubmissionDownload, ChallengeSubmission
from models.challenge_instance import ChallengeInstance, ChallengeInstanceStatus, ChallengeInstanceUpDownload
from auth_manager import *
import database_manager as db

app = FastAPI()

# Add the frontend to our CORS policy.
origins = [
    "http://localhost:5173", 
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  
    allow_credentials=True, 
    allow_methods=["*"],  
    allow_headers=["*"]
)

# Allows grouping of requests to reduce the amount of HTTP requests.
@app.post("/batch")
async def batch_endpoint(gateway: BatchGateway) -> BatchResponse:
    return await gateway.execute()

# An endpoint that does nothing, and is meant to do nothing.
# Empty batch requests are redirected here.
@app.get("/void", response_model=int)
async def void_endpoint():
     return 0

"""
USER endpoint.
"""

# Gets all users data, except for their profile picture.
# Only accessible to admins.
@app.get("/users/", response_model=Set[UserUpDownload])  # response_model is for pydantic data validation of the returned data.
async def get_users(requestor: User = Depends(get_current_user)):
    require_global_admin(requestor)

    return {user.to_endpoint_representation() for user in db.get_all_users().values()}

# Gets the requesting users data, except for its profile picture.
@app.get("/users/me", response_model=UserUpDownload)  # response_model is for pydantic data validation of the returned data.
async def get_me(requestor: User = Depends(get_current_user)):
    return await get_user(requestor.user_uuid, requestor)

# Gets all data of all games the requesting user is in.
@app.get("/users/me/games", response_model=Set[GameUpDownload])  # response_model is for pydantic data validation of the returned data.
async def get_user_games(requestor: User = Depends(get_current_user)):
    user = await get_me(requestor)
    return set([(await get_game(game_uuid, requestor)) for game_uuid in user.game_uuids])

# Gets all Challenge Instances a certain user is part of, that are visible to the requesting user.
@app.get("/users/me/games/{game_uuid}/participants/{user_uuid}/challenge_instances", response_model=Set[ChallengeInstanceUpDownload])  # response_model is for pydantic data validation of the returned data.
async def get_user_challenge_instances(game_uuid: int, user_uuid: int, requestor: User = Depends(get_current_participant)):
    participant = await get_participant(game_uuid, user_uuid, requestor)
    return set([(await get_challenge_instance(game_uuid, instance_uuid, requestor)) for instance_uuid in participant.challenge_instance_uuids])

# Gets a users data, except for its profile picture.
# A general GET command for all users is not accessible to all users, for security reasons.
# You can still get the uuids of other users through your currently played Game.
# For your own profile, you will get info to all games you partake in, for other users, you will only see games that you both partake in.
@app.get("/users/{uuid}", response_model=UserUpDownload)  # response_model is for pydantic data validation of the returned data.
async def get_user(uuid: int, requestor: User = Depends(get_current_user)):
    try:
        requested_user: User = db.get_user(uuid)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Does the client request their own data or are they a global admin.
    if requested_user.auth0_subject_id == requestor.auth0_subject_id or is_global_admin(requestor):
        return requested_user.to_endpoint_representation()
    # Otherwise, only share game_uuids of games both users partake in.
    shared_game_uuids = requestor.game_uuids.union(requested_user.game_uuids)
    requested_user.game_uuids = shared_game_uuids
    return requested_user.to_endpoint_representation()

# Creates a new user.
# Uuid generation is done in the backend, so the uuid passed by the user is ignored, and the newly generated uuid is passed to the client in the response body. 
@app.post("/users", status_code=201, response_model=UserUpDownload) # Status code 201 corresponds to 'request fulfilled, resource created'.
async def add_user(new_user: UserUpDownload, requestor: dict[str, Any] = Depends(get_current_claims)):
    # Do not create users that already exist.
    sub = require_nonexisting_user(requestor)
    new_user.is_global_admin = False

    return db.add_user(new_user, sub).to_endpoint_representation()

# Deletes a user. Also deletes their profile picture from the database.
# This should only be doable by the user themselves or an admin.
@app.delete("/users/{user_uuid}", status_code=204) # Status code 204 corresponds to 'request fulfilled, no content to return'.
async def delete_user(user_uuid: int, requestor: User = Depends(get_current_user)):
    if not (requestor.is_global_admin or requestor.user_uuid == user_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot delete other users' profiles")
    try:
        db.delete_user(user_uuid)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="User does not exist")

# Changes a users data. Attempts to change the uuid will not work.
# This should only be doable by the user themselves or an admin.
@app.put("/users/{user_uuid}")
async def update_user(user_uuid: int, updated_user: UserUpDownload, requestor: User = Depends(get_current_user)):
    if not (requestor.is_global_admin or requestor.user_uuid == user_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update other users' profiles")
    db.update_user(user_uuid, User.from_endpoint_representation(updated_user))
    try:
        return
    except ValueError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="User does not exist")

# Gets the profile picture associated with the given user.
@app.get("/users/{user_uuid}/has_pfp", response_model=bool)
async def has_user_profile_picture(user_uuid: int):
    path = db.get_user_pfp_path(user_uuid)
    return path is not None

# Gets the profile picture associated with the given user.
@app.get("/users/{user_uuid}/pfp", response_class=FileResponse)
async def get_user_profile_picture(user_uuid: int):
    path = db.get_user_pfp_path(user_uuid)
    if path is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="User has no profile picture.")
    return FileResponse(path)

# # Gets the small profile picture associated with the given user.
# @app.get("/users/{user_uuid}/pfp", response_class=FileResponse|None)
# async def get_user_profile_picture_small(user_uuid: int):
#     raise NotImplementedError


# Updates the profile picture associated with the given user.
# This deletes the old profile picture.
# If None is passed, resets the profile picture to the default pfp.
# This should only be doable by the user themselves or an admin.
@app.put("/users/{user_uuid}/pfp")
async def update_user_profile_picture(user_uuid: int, updated_picture: UploadFile, requestor: User = Depends(get_current_user)):
    if not (requestor.is_global_admin or requestor.user_uuid == user_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update other users' profile pictures")
    try:
        if get_file_type(updated_picture.filename) != "image":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="New profile picture should be an image")
        db.update_user_profile_picture(user_uuid, updated_picture.file)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="An error occurred updating the profile picture")


# Updates the profile picture associated with the given user.
# This deletes the old profile picture.
# If None is passed, resets the profile picture to the default pfp.
# This should only be doable by the user themselves or an admin.
@app.delete("/users/{user_uuid}/pfp")
async def delete_user_profile_picture(user_uuid: int, requestor: User = Depends(get_current_user)):
    if not (requestor.is_global_admin or requestor.user_uuid == user_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update other users' profile pictures")
    try:
        db.reset_user_profile_picture(user_uuid)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="An error occurred updating the profile picture")

"""
GAME endpoint.
"""

# Gets all games' data.
@app.get("/games/", response_model=Set[GameUpDownload])
async def get_games(requestor: User = Depends(get_current_user)):
    require_global_admin()

    return set([val.to_endpoint_representation() for val in db.get_all_games().values()])

# Gets a games data.
# A general GET command for all games is not accessible by default, for security reasons.
# You can still get the uuid of your games from your user profile, or enter a new game using an invite link.
@app.get("/games/{game_uuid}", response_model=GameUpDownload)
async def get_game(game_uuid: int, requestor: User = Depends(get_current_user)):
    if not db.game_exists(game_uuid) and requestor.is_global_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot access data for this game (game does not exist)")
    if not db.game_exists(game_uuid) and not requestor.is_global_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot access data for this game")
    if not (requestor.is_global_admin or db.participant_exists(game_uuid, requestor.user_uuid)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot access data for this game")

    return db.get_game(game_uuid).to_endpoint_representation()

# Creates a new game.
# Currently only possible by an admin.
# Uuid generation is done in the backend, so the uuid passed by the user is ignored, and the newly generated uuid is passed to the client in the response body.
@app.post("/games", status_code=201, response_model=int) # Status code 201 corresponds to 'request fulfilled, resource created'.
async def add_game(new_game: Game, requestor: User = Depends(get_current_user)):
    require_global_admin(requestor)

    uuid = db.add_game(new_game)
    db.add_participant(uuid, requestor.user_uuid) # Add the admin as a (temp) participant.

    return uuid
        

# Deletes a game. Also deletes all associated saved data.
# This should only be doable by an admin.
@app.delete("/admin/games/{game_uuid}", status_code=204) # Status code 204 corresponds to 'request fulfilled, no content to return'.
async def delete_game(game_uuid: int, requestor: User = Depends(get_current_user)):
    if not db.game_exists(game_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot delete this game (game does not exist)")

    action_allowed = is_global_admin(requestor) \
        or (db.participant_exists(game_uuid, requestor.user_uuid) \
            and db.get_game_participant(game_uuid, requestor.user_uuid).is_admin)

    if not action_allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot delete this game (insufficient permissions)")

    db.delete_game(game_uuid)

# Changes a games data. Attempts to change the uuid will not work.
# This should only be doable by an admin.
@app.put("/admin/games/{game_uuid}")
async def update_game(game_uuid: int, updated_game: GameUpDownload, admin_mode: bool = Depends(has_admin_permissions), requestor: User = Depends(get_current_user)):
    if not db.game_exists(game_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update this game (game does not exist)")

    if not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update this game (insufficient permissions)")

    db.update_game(game_uuid, Game.from_endpoint_representation(updated_game))

"""
    GAME PARTICIPANT endpoint.
"""

# Gets all participants of a game.
# Does not share ongoing challenges with other users.
@app.get("/admin/games/{game_uuid}/participants", response_model=Dict[str, GameParticipantUpDownload])
async def get_participants(game_uuid: int, admin_mode: bool = Depends(has_admin_permissions), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot access data for this game (insufficient permissions)")

    result = set()
    for participant_uuid in db.get_game(game_uuid).participant_uuids:
        participant = db.get_game_participant(game_uuid, participant_uuid)
        # Only share ongoing challenges both players are a part of.
        result.add(participant)
    return {str(val.user_uuid): val.to_endpoint_representation(db) for val in result}

# Gets all participants of a game.
# Does not share ongoing challenges with other users.
@app.get("/games/{game_uuid}/participants", response_model=Dict[str, GameParticipantUpDownload])
async def get_participants(game_uuid: int, requestor: GameParticipant | User = Depends(get_current_participant)):
    action_allowed = is_global_admin(requestor) if isinstance(requestor, User) else True
    if not action_allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot access data for this game")

    result = set()
    for participant_uuid in db.get_game(game_uuid).participant_uuids:
        participant = db.get_game_participant(game_uuid, participant_uuid)
        # Only share ongoing challenges both players are a part of.
        participant.challenge_instance_uuids = {uuid for uuid in participant.challenge_instance_uuids \
                                                        if db.get_challenge_instance(game_uuid, uuid).is_visible_by(requestor)}
        result.add(participant)
    return {str(val.user_uuid): val.to_endpoint_representation(db) for val in result}
    
# Gets a participant of a game.
@app.get("/admin/games/{game_uuid}/participants/{user_uuid}", response_model=GameParticipantUpDownload)
async def get_participant(game_uuid: int, user_uuid: int, admin_mode: bool = Depends(has_admin_permissions), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot view participant (insufficient permissions)")
    participant = db.get_game_participant(game_uuid, user_uuid)
    return participant.to_endpoint_representation(db)
    
# Gets a participant of a game.
@app.get("/games/{game_uuid}/participants/{user_uuid}", response_model=GameParticipantUpDownload)
async def get_participant(game_uuid: int, user_uuid: int, requestor: GameParticipant | User = Depends(get_current_participant)):
    participant = db.get_game_participant(game_uuid, user_uuid)
    participant.challenge_instance_uuids = {uuid for uuid in participant.challenge_instance_uuids \
                                                    if db.get_challenge_instance(game_uuid, uuid).is_visible_by(requestor)}
    return participant.to_endpoint_representation(db)

# Allows a user to join a game.
# You should only be allowed to join with your own uuid, or if the request is made by an admin.
# The is_admin property will always be set to false when creating a new participant, unless this is the first participant.
@app.post("/games/{game_uuid}/participants")
async def add_participant(game_uuid: int, user: UserUpDownload, requestor: User = Depends(get_current_user)):
    action_allowed = is_global_admin(requestor) or int(user.user_uuid) == requestor.user_uuid

    if not action_allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot add user to this game")
    if not db.user_exists(int(user.user_uuid)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="User does not exist")
    if db.participant_exists(game_uuid, int(user.user_uuid)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="User is already a participant")

    new_participant = GameParticipant(user_uuid=int(user.user_uuid), is_admin=False, challenge_instance_uuids=set())
    db.add_game_participant(game_uuid, new_participant)

# Deletes a game participant. Does not delete all associated saved data as that might invalidate coop or contest challenges.
# This should only be doable by an admin or the user themselves.
@app.delete("/admin/games/{game_uuid}/participants/{user_uuid}", status_code=204) # Status code 204 corresponds to 'request fulfilled, no content to return'.
async def delete_participant(game_uuid: int, user_uuid: int, admin_mode: bool = Depends(has_admin_permissions), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not has_admin_permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot remove user from this game")
    if not db.user_exists(user_uuid):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="User does not exist")
    if not db.participant_exists(game_uuid, user_uuid):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="User is not a participant")

    db.delete_game_participant(game_uuid, user_uuid)

# Deletes a game participant. Does not delete all associated saved data as that might invalidate coop or contest challenges.
# This should only be doable by an admin or the user themselves.
@app.delete("/games/{game_uuid}/participants/{user_uuid}", status_code=204) # Status code 204 corresponds to 'request fulfilled, no content to return'.
async def delete_participant(game_uuid: int, user_uuid: int, requestor: GameParticipant | User = Depends(get_current_participant)):
    if user_uuid != requestor.user_uuid:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot remove user from this game")
    if not db.user_exists(user_uuid):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="User does not exist")
    if not db.participant_exists(game_uuid, user_uuid):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="User is not a participant")

    db.delete_game_participant(game_uuid, user_uuid)

# Updates a participants data.
# For example to start a new challenge, or complete one.
# This should only be doable by an admin or the user themselves.
# In order to change the is_admin property of a user, the request has to be made by an admin themselves.
@app.put("/games/{game_uuid}/participants/{user_uuid}")
async def update_participant(game_uuid: int, user_uuid: int, participant: GameParticipantUpDownload, requestor: GameParticipant | User = Depends(get_current_participant)):
    action_allowed = is_global_admin(requestor) if isinstance(requestor, User) else requestor.is_admin
    participant: GameParticipant = GameParticipant.from_endpoint_representation(participant)

    if not action_allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot add user to this game")
    if not db.user_exists(user_uuid):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="User does not exist")
    if not db.participant_exists(game_uuid, user_uuid):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="User is not a participant")

    # Only an admin is allowed to change the admin role of a participant.
    if (db.get_game_participant(game_uuid, user_uuid).is_admin != participant.is_admin) \
        and not (is_global_admin(requestor) or (isinstance(requestor, GameParticipant) and requestor.is_admin)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot change admin status")

    db.update_game_participant(game_uuid, user_uuid, participant)

# Gets a games leaderboard.
# Returns it as an ordered list of participant_uuids and their associated point totals.
@app.get("/games/{game_uuid}/leaderboard", response_model=List[Tuple[str, int]])
async def get_game_leaderboard(game_uuid: int, requestor: User = Depends(get_current_user)):
    if not db.game_exists(game_uuid) and requestor.is_global_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot access data for this game (game does not exist)")
    if not db.game_exists(game_uuid) and not requestor.is_global_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot access data for this game")
    if not (requestor.is_global_admin or db.participant_exists(game_uuid, requestor.user_uuid)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot access data for this game")

    return [[str(entry[0]), entry[1]] for entry in db.get_game(game_uuid).get_leaderboard(db)]

"""
    GAME CHALLENGE endpoint.
"""

# Gets all challenges of a game.
@app.get("/admin/games/{game_uuid}/challenges", response_model=Set[ChallengeUpDownload])
async def get_visible_challenges(game_uuid: int, admin_permissions: bool = Depends(has_admin_permissions), requestor: GameParticipant | None = Depends(get_current_participant)):
    if admin_permissions:
         return {value.to_endpoint_representation(requestor, game_uuid, db) for value in db.get_challenges(game_uuid).values()}

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="You do not have access to the admin portal.")

# Gets all challenges of a game.
@app.get("/games/{game_uuid}/challenges", response_model=Set[ChallengeUpDownload])
async def get_visible_challenges(game_uuid: int, requestor: GameParticipant | None = Depends(get_current_participant)):
    if requestor is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="You do not have access to this game.")
    return {value.to_endpoint_representation(requestor, game_uuid, db) for value in db.get_challenges(game_uuid).values() if value.is_visible_by(requestor, db)}

# Gets a challenge of a game.
@app.get("/games/{game_uuid}/challenges/{challenge_uuid}", response_model=ChallengeUpDownload)
async def get_visible_challenge(game_uuid: int, challenge_uuid: int, requestor: GameParticipant | None = Depends(get_current_participant)):
    # if has_admin_access:
    #             return db.get_challenge(game_uuid, challenge_uuid).to_endpoint_representation(requestor, game_uuid, db)
    if requestor is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="You do not have access to this game.")
    challenge = db.get_challenge(game_uuid, challenge_uuid)
    if challenge.is_visible_by(requestor):
            return challenge.to_endpoint_representation(requestor, game_uuid, db)
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="You do not have access to this challenge.")


# Gets all challenge instances of a game that are an instance of the specified challenge and are joinable by the requestor.
@app.get("/games/{game_uuid}/challenges/{challenge_uuid}/joinable_instances", response_model=Dict[str, ChallengeInstanceUpDownload])
async def get_joinable_instances(game_uuid: int, challenge_uuid: int, requestor: GameParticipant | User = Depends(get_current_participant)):
    if not db.challenge_exists(game_uuid, challenge_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge does not exist")

    challenge = db.get_challenge(game_uuid, challenge_uuid)
    return {str(instance.challenge_instance_uuid): instance.to_endpoint_representation(requestor, game_uuid, db) for instance in challenge.get_joinable_challenge_instances(requestor, game_uuid, db)}

# Adds a challenge to a game.
# Uuid generation is done in the backend, so the uuid passed by the user is ignored, and the newly generated uuid is passed to the client in the response body. 
# This should only be allowed by an admin.
@app.post("/admin/games/{game_uuid}/challenges", response_model=int)
async def add_supported_challenge(game_uuid: int, new_challenge: Challenge, admin_mode: bool = Depends(has_admin_permissions), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not admin_mode:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot add challenge to this game")
    
    return db.add_supported_challenge(game_uuid, new_challenge)
    
# Deletes a challenge. Deletes all instances of that challenge that have been started or completed already.
# This should only be doable by an admin.
@app.delete("/admin/games/{game_uuid}/challenges/{challenge_uuid}", status_code=204) # Status code 204 corresponds to 'request fulfilled, no content to return'.
async def delete_supported_challenge(game_uuid: int, challenge_uuid: int, admin_mode: bool = Depends(has_admin_permissions), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot remove challeneg from this game (insufficient permissions)")

    if not db.challenge_exists(game_uuid, challenge_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge does not exist")
    
    return db.delete_challenge(game_uuid, challenge_uuid)

# Updates a challenges data.
# This should only be doable by an admin.
@app.put("/admin/games/{game_uuid}/challenges/{challenge_uuid}")
async def update_supported_challenge(game_uuid: int, challenge_uuid: int, updated_challenge: ChallengeUpDownload, admin_mode: bool = Depends(has_admin_permissions), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not has_admin_permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot update challenge (insufficient permissions)")

    if not db.challenge_exists(game_uuid, challenge_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge does not exist")
    
    return db.update_supported_challenge(game_uuid, challenge_uuid, Challenge.from_endpoint_representation(updated_challenge))

"""
    GAME CHALLENGE INSTANCE endpoint.
"""

# Gets all challenge instances of a game.
@app.get("/admin/games/{game_uuid}/challenge_instances", response_model=Set[ChallengeInstanceUpDownload])
async def get_challenge_instances(game_uuid: int, admin_mode: bool = Depends(has_admin_permissions), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot view these challenge instances (insufficent permissions)")

    return set(value.to_endpoint_representation(requestor, game_uuid, db) for value in db.get_challenge_instances(game_uuid).values())

# Gets all challenge instances of a game.
@app.get("/games/{game_uuid}/challenge_instances", response_model=Set[ChallengeInstanceUpDownload])
async def get_challenge_instances(game_uuid: int, challenge_instance_uuids=Set[str] | str, requestor: GameParticipant | User = Depends(get_current_participant)):
    admin_access = is_global_admin(requestor) if isinstance(requestor, User) else requestor.is_admin
    if isinstance(challenge_instance_uuids, str) and challenge_instance_uuids.to_lower() == "all":
        if not admin_access:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot view these challenge instances")

        return set(value.to_endpoint_representation(db.get_challenge) for value in db.get_challenge_instances(game_uuid).values())
    if isinstance(challenge_instance_uuids, str):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Invalid request body")

    challenge_instances = db.get_challenge_instances(game_uuid)
    results: set[ChallengeInstanceUpDownload] = set()
    for uuid in challenge_instance_uuids:
        if uuid in challenge_instance_uuids and (admin_access or challenge_instances[uuid].is_visible_by(requestor)):
            results.add(challenge_instances[uuid].to_endpoint_representation(db.challenge))
        elif uuid in challenge_instance_uuids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot view (some of) these challenge instances")
    return results

# Gets a challenge instance of a game.
@app.get("/admin/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}", response_model=ChallengeInstanceUpDownload)
async def get_challenge_instance(game_uuid: int, challenge_instance_uuid: int, admin_mode: bool = Depends(has_admin_permissions), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot retrieve challenge instance (insufficient permissions)")
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance does not exist")

    challenge_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)
    return challenge_instance.to_endpoint_representation(requestor, game_uuid, db)

# Gets a challenge instance of a game.
@app.get("/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}", response_model=ChallengeInstanceUpDownload)
async def get_challenge_instance(game_uuid: int, challenge_instance_uuid: int, requestor: GameParticipant | User = Depends(get_current_participant)):
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance does not exist")

    challenge_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)

    if isinstance(requestor, GameParticipant) and challenge_instance.is_visible_by(requestor):
        return challenge_instance.to_endpoint_representation(requestor, game_uuid, db)
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                        detail="Challenge instance not accessible")


# Adds a challenge instance to a game.
# Uuid generation is done in the backend, so the uuid passed by the user is ignored, and the newly generated uuid is passed to the client in the response body. 
@app.post("/games/{game_uuid}/challenge_instances", response_model=ChallengeInstanceUpDownload)
async def add_challenge_instance(game_uuid: int, new_challenge_instance: ChallengeInstanceUpDownload, admin_mode: bool = Depends(has_admin_enabled), requestor: GameParticipant | User = Depends(get_current_participant)):
    print(admin_mode)
    new_challenge_instance: ChallengeInstance = ChallengeInstance.from_endpoint_representation(new_challenge_instance)

    if not db.challenge_exists(game_uuid, new_challenge_instance.challenge_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Associated challenge does not exist")

    if not admin_mode and not requestor.user_uuid in new_challenge_instance.participant_uuids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot create this challenge instance")
    if not admin_mode and not db.get_challenge(game_uuid, new_challenge_instance.challenge_uuid).is_joinable_by(requestor, game_uuid, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot create this challenge instance")

    new_challenge_instance.start_time = datetime.now(timezone.utc)
    new_challenge_instance.complete_time = None
    new_challenge_instance.overwrite_points = None
    new_challenge_instance.status = ChallengeInstanceStatus.ongoing
    new_challenge_instance.leaderboard = []
    new_challenge_instance.overwrite_leaderboard_to_manual = False
    participant_uuids = new_challenge_instance.participant_uuids  # Store externally as db.add_challenge_instance overwrites it.
    uuid = db.add_challenge_instance(game_uuid, new_challenge_instance)
    new_challenge_instance.participant_uuids = participant_uuids
    new_challenge_instance.challenge_instance_uuid = uuid
    for participant_uuid in participant_uuids:
        if not db.participant_exists(game_uuid, participant_uuid):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Participant does not exist")
        if participant_uuid in db.get_challenge_instance(game_uuid, uuid).participant_uuids:
                continue
        db.add_challenge_participant(game_uuid, uuid, participant_uuid)

    return db.get_challenge_instance(game_uuid, uuid).to_endpoint_representation(requestor, game_uuid, db)

# Deletes a challenge instance.
# This should only be doable by an admin.
@app.delete("/admin/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}", status_code=204) # Status code 204 corresponds to 'request fulfilled, no content to return'.
async def delete_challenge_instance(game_uuid: int, challenge_instance_uuid: int, admin_mode: bool = Depends(has_admin_permissions), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot delete this challenge instance (insufficient permissions)")

    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot delete this challenge instance (it does not exist)")

    db.delete_challenge_instance(game_uuid, challenge_instance_uuid)

# Updates a challenge instances data.
# If the challenge is completed, this should only be doable by an admin.
# If it is ongoing, its status can be changed by a participant to under_review and back if they think they made a mistake.
# If it is under_review, times_up or approved, this is not changeable by a participant.
@app.put("/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}")
async def update_challenge_instance(game_uuid: int, challenge_instance_uuid: int, updated_challenge_instance: ChallengeInstanceUpDownload, admin_mode: bool = Depends(has_admin_enabled), requestor: GameParticipant | User = Depends(get_current_participant)):
    updated_challenge_instance: ChallengeInstance = ChallengeInstance.from_endpoint_representation(updated_challenge_instance)
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update this challenge instance (it does not exist)")

    original_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)

    match original_instance.status:
        case ChallengeInstanceStatus.ongoing:
              change_allowed = True
        case ChallengeInstanceStatus.under_review:
              change_allowed = True
        case ChallengeInstanceStatus.times_up:
              change_allowed = admin_mode
        case ChallengeInstanceStatus.approved:
              change_allowed = admin_mode
        case ChallengeInstanceStatus.failed:
              change_allowed = admin_mode
    if not change_allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update this challenge instance")

    if updated_challenge_instance.status != original_instance.status and not admin_mode:
        if not all([status in [ChallengeInstanceStatus.ongoing, ChallengeInstanceStatus.under_review]] for status in [updated_challenge_instance.status, original_instance.status]):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot update this challenge instance status in this way (invalid status transition)")
    if updated_challenge_instance.overwrite_points != original_instance.overwrite_points and not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update this challenge instance in this way (tried to overwrite points)")
    if updated_challenge_instance.overwrite_leaderboard_to_manual != original_instance.overwrite_leaderboard_to_manual and not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update this challenge instance in this way (tried to set leaderboard to manual)")
    if updated_challenge_instance.leaderboard != original_instance.leaderboard and not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update this challenge instance in this way (tried to overwrite leaderboard)")
    if updated_challenge_instance.start_time != original_instance.start_time and not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update this challenge instance in this way (tried to change start_time)")
    if updated_challenge_instance.complete_time != original_instance.complete_time and not admin_mode and original_instance.status == ChallengeInstanceStatus.under_review:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update this challenge instance in this way (tried to change complete_time)")

    db.update_challenge_instance(game_uuid, challenge_instance_uuid, updated_challenge_instance)
    if admin_mode:  # Admins can change which players participate in a challenge instance.
        for participant_uuid in updated_challenge_instance.participant_uuids:
            if not participant_uuid in original_instance.participant_uuids:
                if not db.participant_exists(game_uuid, participant_uuid):
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                        detail="Participant does not exist")
                db.add_challenge_participant(game_uuid, challenge_instance_uuid, participant_uuid)
        for participant_uuid in original_instance.participant_uuids:
            if not participant_uuid in updated_challenge_instance.participant_uuids:
                db.delete_challenge_participant(game_uuid, challenge_instance_uuid, participant_uuid)


# Allows a participant to join a challenge instance, only if it is ongoing.
# This should only be doable by an admin or the user themselves.
@app.post("/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}/participants")
async def add_participant(game_uuid: int, challenge_instance_uuid: int, participant: GameParticipantUpDownload, admin_mode: bool = Depends(has_admin_enabled), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update this challenge instance (it does not exist)")
    if not db.participant_exists(game_uuid, int(participant.user.user_uuid)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Participant does not exist")

    challenge_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)
    participant: GameParticipant = GameParticipant.from_endpoint_representation(participant)
    if participant.user_uuid in challenge_instance.participant_uuids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Participant already in challenge instance")
    if not admin_mode and participant.user_uuid != requestor.user_uuid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Participant cannot join challenge instance (insufficient permissions)")
    if not admin_mode and not challenge_instance.is_joinable_by(participant, game_uuid, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Participant cannot join challenge instance")

    db.add_challenge_participant(game_uuid, challenge_instance_uuid, participant.user_uuid)

    
# Allows a participant to leave a challenge instance, only if it is ongoing.
# This should only be doable by an admin or the user themselves.
@app.delete("/admin/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}/participants/{participant_uuid}")
async def delete_participant(game_uuid: int, challenge_instance_uuid: int, participant_uuid: int, admin_mode: bool = Depends(has_admin_permissions), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update this challenge instance (it does not exist)")
    if not db.participant_exists(game_uuid, participant_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Participant does not exist")

    challenge_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)
    if participant_uuid not in challenge_instance.participant_uuids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Participant not in challenge instance")

    if not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Participant cannot be removed from challenge instance (insufficient permissions)")

    db.delete_challenge_participant(game_uuid, challenge_instance_uuid, participant_uuid)

    
# Allows a participant to leave a challenge instance, only if it is ongoing.
# This should only be doable by an admin or the user themselves.
@app.delete("/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}/participants/{participant_uuid}")
async def delete_participant(game_uuid: int, challenge_instance_uuid: int, participant_uuid: int, requestor: GameParticipant | User = Depends(get_current_participant)):
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot update this challenge instance (it does not exist)")
    if not db.participant_exists(game_uuid, participant_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Participant does not exist")

    challenge_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)
    if participant_uuid not in challenge_instance.participant_uuids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Participant not in challenge instance")

    if participant_uuid != requestor.user_uuid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Participant cannot be removed from challenge instance (insufficient permissions)")

    db.delete_challenge_participant(game_uuid, challenge_instance_uuid, participant_uuid)

"""
    GAME CHALLENGE INSTANCE SUBMISSION endpoint.
"""

# Gets all challenge submissions of a challenge instance.
@app.get("/admin/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}/submissions", response_model=Set[ChallengeSubmissionDownload])
async def get_challenge_submissions(game_uuid: int, challenge_instance_uuid: int, admin_mode: bool = Depends(has_admin_permissions), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance does not exist")
    challenge_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)
    if not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot access challenge instance (insufficient permissions)")

    return {value.to_endpoint_representation(lambda filename: db.get_challenge_submission_full_path_from_filename(game_uuid, filename)) for value in db.get_challenge_submissions(game_uuid).values() \
            if value.challenge_submission_uuid in challenge_instance.challenge_submission_uuids}

# Gets all challenge submissions of a challenge instance.
@app.get("/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}/submissions", response_model=Set[ChallengeSubmissionDownload])
async def get_challenge_submissions(game_uuid: int, challenge_instance_uuid: int, requestor: GameParticipant | User = Depends(get_current_participant)):
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance does not exist")
    challenge_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)
    if not requestor.user_uuid in challenge_instance.participant_uuids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot access challenge instance submissions")

    return {value.to_endpoint_representation(lambda filename: db.get_challenge_submission_full_path_from_filename(game_uuid, filename)) for value in db.get_challenge_submissions(game_uuid).values() \
            if value.challenge_submission_uuid in challenge_instance.challenge_submission_uuids}

# Gets a challenge submission of a challenge instance.
@app.get("/admin/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}/submissions/{submission_uuid}", response_model=ChallengeSubmissionDownload)
async def get_challenge_submission(game_uuid: int, challenge_instance_uuid: int, challenge_submission_uuid: int, admin_mode: bool = Depends(has_admin_permissions), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance does not exist")
    if not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot access challenge instance submissions")
         
    challenge_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)
    if challenge_submission_uuid not in challenge_instance.challenge_submission_uuids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance submission does not exist")

    challenge_submission = db.get_challenge_submission(game_uuid, challenge_submission_uuid)
    return challenge_submission.to_endpoint_representation(lambda filename: db.get_challenge_submission_full_path_from_filename(game_uuid, filename))

# Gets a challenge submission of a challenge instance.
@app.get("/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}/submissions/{submission_uuid}", response_model=ChallengeSubmissionDownload)
async def get_challenge_submission(game_uuid: int, challenge_instance_uuid: int, challenge_submission_uuid: int, requestor: GameParticipant | User = Depends(get_current_participant)):
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance does not exist")
    challenge_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)
    if not requestor.user_uuid in challenge_instance.participant_uuids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot access challenge instance submissions")
    if challenge_submission_uuid not in challenge_instance.challenge_submission_uuids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance submission does not exist")

    challenge_submission = db.get_challenge_submission(game_uuid, challenge_submission_uuid)
    return challenge_submission.to_endpoint_representation(lambda filename: db.get_challenge_submission_full_path_from_filename(game_uuid, filename))

# Gets a challenge submission of a challenge instance.
@app.get("/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}/submissions/{submission_uuid}/files/{filename}", response_class=FileResponse)
async def get_challenge_submission_file(game_uuid: int, challenge_instance_uuid: int, submission_uuid: int, filename: str, requestor: GameParticipant | User = Depends(get_current_participant)):
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance does not exist")
    challenge_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)
    if submission_uuid not in challenge_instance.challenge_submission_uuids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance submission does not exist")
    
    challenge_submission = db.get_challenge_submission(game_uuid, submission_uuid)
    if filename not in challenge_submission.data:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="File does not exist")
    return FileResponse(db.get_challenge_submission_full_path_from_filename(game_uuid, filename))
     

# Adds a challenge submission to a challenge instance.
# Uuid generation is done in the backend, so the uuid passed by the user is ignored, and the newly generated uuid is passed to the client in the response body.
@app.post("/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}/submissions", response_model=ChallengeSubmissionDownload)
async def add_challenge_submission(game_uuid: int, challenge_instance_uuid: int,
                                   submission: Annotated[ChallengeSubmissionUpload, Form()],
                                   admin_mode: bool = Depends(has_admin_enabled),
                                   requestor: GameParticipant | User = Depends(get_current_participant)):
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance does not exist")
    challenge_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)
    if not admin_mode and not (requestor.user_uuid in challenge_instance.participant_uuids and challenge_instance.status == ChallengeInstanceStatus.ongoing):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot access challenge instance submissions")
    if not all([get_file_type(file.filename) in ['image', 'video'] for file in submission.data]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot upload this filetype")

    uuid = db.add_challenge_submission(game_uuid, challenge_instance_uuid, submission)
    submission.challenge_submission_uuid = uuid
    return ChallengeSubmission.from_endpoint_representation(submission, db.get_challenge_submission_filename_from_file) \
                              .to_endpoint_representation(lambda filename: db.get_challenge_submission_full_path_from_filename(game_uuid, filename))

# Deletes a challenge submission. Also deletes all pictures, videos etc submitted along with it.
# This should only be doable by an admin or the person that submitted it.
@app.delete("/admin/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}/submissions/{submission_uuid}", status_code=204) # Status code 204 corresponds to 'request fulfilled, no content to return'.
async def delete_challenge_submission(game_uuid: int, challenge_instance_uuid: int, submission_uuid: int, admin_mode: bool = Depends(has_admin_permissions), requestor: GameParticipant | User = Depends(get_current_participant)):
    if not admin_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot access challenge instance submissions (insufficient permissions)")
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance does not exist")
    challenge_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)
    if submission_uuid not in challenge_instance.challenge_submission_uuids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance submission does not exist")

    db.delete_challenge_submission(game_uuid, challenge_instance_uuid, submission_uuid)

# Deletes a challenge submission. Also deletes all pictures, videos etc submitted along with it.
# This should only be doable by an admin or the person that submitted it.
@app.delete("/games/{game_uuid}/challenge_instances/{challenge_instance_uuid}/submissions/{submission_uuid}", status_code=204) # Status code 204 corresponds to 'request fulfilled, no content to return'.
async def delete_challenge_submission(game_uuid: int, challenge_instance_uuid: int, submission_uuid: int, requestor: GameParticipant | User = Depends(get_current_participant)):
    if not db.challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance does not exist")
    challenge_instance = db.get_challenge_instance(game_uuid, challenge_instance_uuid)
    if not (requestor.user_uuid in challenge_instance.participant_uuids and challenge_instance.status == ChallengeInstanceStatus.ongoing):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot access challenge instance submissions")
    if submission_uuid not in challenge_instance.challenge_submission_uuids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Challenge instance submission does not exist")

    db.delete_challenge_submission(game_uuid, challenge_instance_uuid, submission_uuid)