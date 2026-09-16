"""
This python file allows for data to be loaded and saved from and to the database.
It assumes everything is already in the correct python formats (instances of the classes defined in ./models/).
It also assumes all permissions are in order.
It still performs data validation.
"""

import asyncio
from dotenv import load_dotenv
from io import BufferedRandom

from PIL import Image

import os, shutil
import json
from uuid import uuid4
from datetime import datetime, timezone

from fastapi import UploadFile

from utils.json_extensions import CustomDecoder, CustomEncoder
from models.user import User, UserUpDownload
from models.game import Game
from models.game_participant import GameParticipant
from models.challenge import Challenge, ChallengeType, ContestEntryType
from models.challenge_submission import ChallengeSubmissionUpload, ChallengeSubmission
from models.challenge_instance import ChallengeInstance, ChallengeInstanceStatus

load_dotenv()


_DATABASE_PATH = os.environ["DATABASE_PATH"]
_USER_FILE = os.path.join(_DATABASE_PATH, "users", "users.json")
_PROFILE_PICTURES_DIRECTORY = os.path.join(_DATABASE_PATH, "users", "profile_pictures")
_GAMES_DIRECTORY = os.path.join(_DATABASE_PATH, "games")
_GAME_DIRECTORY = lambda uuid: os.path.join(_DATABASE_PATH, "games", str(uuid))
_GAME_JSON_PATH = lambda uuid: os.path.join(_GAME_DIRECTORY(uuid), "game.json")
_PARTICIPANTS_JSON_PATH = lambda uuid: os.path.join(_GAME_DIRECTORY(uuid), "participants.json")
_CHALLENGES_JSON_PATH = lambda uuid: os.path.join(_GAME_DIRECTORY(uuid), "challenges.json")
_CHALLENGE_INSTANCES_JSON_PATH = lambda uuid: os.path.join(_GAME_DIRECTORY(uuid), "challenge_instances.json")
_CHALLENGE_SUBMISSIONS_JSON_PATH = lambda uuid: os.path.join(_GAME_DIRECTORY(uuid), "challenge_submissions.json")
_CHALLENGE_SUBMISSIONS_DATA_DIRECTORY = lambda uuid: os.path.join(_GAME_DIRECTORY(uuid), "challenge_submissions_data")


def _generate_uuid() -> int:
    """
    generates a valid uuid.
    """
    return uuid4().int


def set_database_location(new_location: str):
    """
    Changes the database location. Should only be used for testing purposes, when you don't want to change the actual database.
    Does not delete the old database.
    """
    global _DATABASE_PATH
    _DATABASE_PATH = new_location


def reset_database_location():
    """
    Resets the database path to its standard location.
    Does not delete the old database.
    """
    global _DATABASE_PATH
    _DATABASE_PATH = os.path.join(".", "data")


def remove_directory_structure():
    """
    Removes the database directory structure from a location.
    """
    # Remove all currently stored data.
    if os.path.exists(_DATABASE_PATH):
        shutil.rmtree(_DATABASE_PATH)  # Recursively delete everything in .\data


def create_directory_structure():
    """
    Creates the appropriate directory structure for the database.
    In contrast to reset_directory_structure(), this does not delete all currently stored data, if present.
    """
    os.makedirs(os.path.dirname(_USER_FILE), exist_ok=True)
    os.makedirs(_PROFILE_PICTURES_DIRECTORY, exist_ok=True)
    os.makedirs(_GAMES_DIRECTORY, exist_ok=True)


def reset_directory_structure():
    """
    Creates the appropriate directory structure for the database.
    In contrast to reset_directory_structure(), this does delete all currently stored data, if present.
    """
    remove_directory_structure()
    create_directory_structure()


"""
--------------------------------------------------------------------------------------------------------------------------------------------------------
----------------------------------------------------------------------- User Info ----------------------------------------------------------------------
--------------------------------------------------------------------------------------------------------------------------------------------------------
"""

def _save_users(users: dict[str | int, User | dict]):
    """
    Takes all users, stored in a dictionary keyed by their uuid, and stores them in the users.json file.
    """
    with open(_USER_FILE, 'w+') as user_file:
        json.dump(users, user_file, indent=4, cls=CustomEncoder)


def get_all_users() -> dict[int, User]:
    """
    Gets all users, stored in a dictionary keyed by their uuid.
    Returns all data stored for a user, not just the data that should be sent to the frontend.
    """
    if not os.path.exists(_USER_FILE):
        return {}
    if os.path.getsize(_USER_FILE) == 0:  # Empty file.
        return {}

    # Reads the user.json file as a dict keyed by uuid.
    with open(_USER_FILE) as user_file:
        loaded_data: dict[str, dict] = json.load(user_file, cls=CustomDecoder)

    return {int(key): User.model_construct(**value) for (key, value) in loaded_data.items()}


def get_user(uuid: int) -> User:
    """
    Gets a users data.
    Raises a ValueError if the specified user does not exist.
    """
    all_users = get_all_users()

    if uuid not in all_users:
        raise ValueError("Specified user does not exist.")
    
    return all_users[uuid]


def user_exists(uuid: int) -> bool:
    """
    Returns if the specified uuid corresponds with a valid user.
    """
    return uuid in get_all_users()


def add_user(new_user: UserUpDownload | User, auth0_sub: str) -> User:
    """
    Creates a new user.
    The new user gets a default profile picture, and partakes in no games.
    Uuid generation is done in the backend, so the uuid passed by the caller is ignored.
    The newly generated uuid is returned and also used to overwrite the user_uuid property in the new_user argument.
    """
    new_user.user_uuid = _generate_uuid()  # Overwrite uuid with securely generated one.
    new_user_as_dict = new_user.model_dump()  # Convert to dictionary, works for both UserUpDownload and User.
    new_user_as_dict["auth0_subject_id"] = auth0_sub
    new_user_as_dict["pfp_path"] = None  # New users get a default profile picture.
    new_user_as_dict["games"] = set()

    # Add new user to all users.
    user_dict = get_all_users()
    user_dict[new_user.user_uuid] = User.model_construct(**new_user_as_dict)

    _save_users(user_dict)
    return user_dict[new_user.user_uuid]


def delete_user(user_uuid: int):
    """
    Deletes a user.
    Also deletes their profile picture from the database, and removes them from any games they partake in.
    Raises a ValueError if the specified user does not exist.
    """
    user_dict = get_all_users()

    if user_uuid not in user_dict:
        raise ValueError("User does not exist.")
    user = user_dict[user_uuid]

    # Delete associated profile picture.
    profile_picture_path = user["pfp_path"]
    if profile_picture_path is not None:
        os.remove(os.path.join(_PROFILE_PICTURES_DIRECTORY, profile_picture_path))
        small_pfp_path = profile_picture_path.replace(".jpg", "_small.jpg")
        if os.path.exists(small_pfp_path):
            os.remove(os.path.join(_PROFILE_PICTURES_DIRECTORY, small_pfp_path))

    # Delete user from any games.
    for game_uuid in user.game_uuids:
        delete_game_participant(game_uuid, user_uuid)

    user_dict.pop(user_uuid)
    _save_users(user_dict)


def update_user(user_uuid: int, updated_user: User):
    """
    Changes a users data.
    Attempts to change the uuid will not work, the old uuid will be kept, and put in the user_uuid field of the updated_user argument.
    Attempts to change the games the user partakes in will not work, they have their own access methods.
    Raises a ValueError if the specified user does not exist.
    """
    user_dict = get_all_users()

    if user_uuid not in user_dict:
        raise ValueError("User does not exist.")

    # Repair the uuid, convert to dict, and replace old values with these new ones.
    updated_user.user_uuid = user_uuid
    updated_user_as_dict = updated_user.model_dump()
    updated_user_as_dict.pop("game_uuids")
    updated_user_as_dict.pop("pfp_path")
    updated_user_as_dict.pop("auth0_subject_id")
    total_dict =  user_dict[user_uuid].model_dump()
    total_dict.update(updated_user_as_dict)
    user_dict[user_uuid] = User.model_construct(**total_dict)
    _save_users(user_dict)


def get_user_pfp_path(user_uuid: int) -> str | None:
    """
    Returns the filepath of the users profile picture, for example for use in a FileResponse.
    If the specified user does not exist, throws a ValueError.
    Validates if the file exists, if not, it throws a FileNotFoundError.
    If the file is empty, or of an incorrect type, throws a SystemError.
    Does not validate contents.
    """
    profile_picture_path = get_user(user_uuid).pfp_path

    if profile_picture_path is None:
        return None

    full_path = os.path.join(_PROFILE_PICTURES_DIRECTORY, profile_picture_path)

    if not os.path.exists(full_path):
        raise FileNotFoundError(f"The profile picture for user {user_uuid} is not found in the database.")
    if os.path.getsize(full_path) == 0:  # Empty file.
        raise SystemError(f"The profile picture for user {user_uuid} is zero bytes.")
    if not full_path.endswith(".jpg"):
        raise SystemError("The profile picture for user {user_uuid} is in an incorrect format: {full_path}.")

    return full_path

# Gets the profile picture associated with the given user, in a smaller format than the full HD upload.
def get_user_profile_picture_small(user_uuid: int) -> str:
    """
    Returns the filepath of the users small profile picture, for example for use in a FileResponse.
    If the specified user does not exist, throws a ValueError.
    Validates if the file exists, if not, creates a new one based on the full scale profile picture, if that doesn't exit, throws a FileNotFoundError.
    If the file is empty, or of an incorrect type, throws a SystemError.
    Does not validate contents.
    """
    SMALL_PFP_SIZE = 128
    total_picture_path = get_user_pfp_path(user_uuid)
    small_picture_path = total_picture_path.replace(".jpg", "_small.jpg")

    if os.path.getsize(small_picture_path) == 0:  # Empty file.
        raise SystemError(f"The profile picture for user {user_uuid} is zero bytes.")
    if not small_picture_path.endswith(".jpg"):
        raise SystemError(f"The profile picture for user {user_uuid} is in an incorrect format: {small_picture_path}.")
    if not os.path.exists(small_picture_path):
        # Create a new small profile picture.
        with Image.open(total_picture_path) as im:
            im.thumbnail(SMALL_PFP_SIZE)
            im.save(small_picture_path, "JPG")

    return small_picture_path


def update_user_profile_picture(user_uuid: int, updated_picture: Image.Image):
    """
    Updates the profile picture associated with the given user.
    If the specified user does not exist, throws a ValueError.
    Deletes the old profile picture.
    """
    # Delete the old profile picture.
    user_dict = get_all_users()
    if user_uuid not in user_dict:
        raise ValueError("User does not exist.")
    pfp_path = user_dict[user_uuid].pfp_path
    if pfp_path is not None:
        small_pfp_path = pfp_path.replace(".jpg", "_small.jpg")
        os.remove(os.path.join(_PROFILE_PICTURES_DIRECTORY, pfp_path))
        if os.path.exists(small_pfp_path):
            os.remove(os.path.join(_PROFILE_PICTURES_DIRECTORY, small_pfp_path))

    # Save new image to file.
    new_pfp_path = str(hash(updated_picture)) + ".jpg"
    with open(os.path.join(_PROFILE_PICTURES_DIRECTORY, new_pfp_path), 'wb+') as file:
                    file.write(updated_picture.read())

    # Update entry in user_dict.
    user_dict[user_uuid].pfp_path = new_pfp_path
    _save_users(user_dict)


def reset_user_profile_picture(user_uuid: int):
    """
    Changes the profile picture associated with the given user back to the default picture.
    Deletes the old profile picture.
    """
    # Delete the old profile picture.
    user_dict = get_all_users()
    if user_uuid not in user_dict:
        raise ValueError("User does not exist.")
    pfp_path = user_dict[user_uuid].pfp_path
    if pfp_path is not None:
        small_pfp_path = pfp_path.replace(".jpg", "_small.jpg")
        os.remove(os.path.join(_PROFILE_PICTURES_DIRECTORY, pfp_path))
        if os.path.exists(small_pfp_path):
            os.remove(os.path.join(_PROFILE_PICTURES_DIRECTORY, small_pfp_path))

    # Update entry in user_dict.
    user_dict[user_uuid].pfp_path = None
    _save_users(user_dict)


"""
--------------------------------------------------------------------------------------------------------------------------------------------------------
----------------------------------------------------------------------- Game Info ----------------------------------------------------------------------
--------------------------------------------------------------------------------------------------------------------------------------------------------
"""

def _save_game(game: Game):
    with open(_GAME_JSON_PATH(game.game_uuid), 'w+') as game_file:
        json.dump(obj=game.model_dump(), fp=game_file, indent=4, cls=CustomEncoder)


def get_all_games() -> dict[int, Game]:
    """
    Gets all games' data.
    """
    if not os.path.exists(_GAMES_DIRECTORY):
        raise ValueError("Database not set up correctly.")

    uuids = [int(dir) for dir in os.listdir(_GAMES_DIRECTORY)]
    return {uuid: get_game(uuid) for uuid in uuids}


def get_game(game_uuid: int) -> Game:
    """
    Gets a games data.
    If the specified game does not exist, throws a ValueError.
    """
    if not os.path.exists(_GAME_DIRECTORY(game_uuid)):
        raise ValueError("Specified game does not exist.")
    if not os.path.exists(_GAME_JSON_PATH(game_uuid)):
        raise SystemError(f"Specified game {game_uuid} is corrupted.")
    if os.path.getsize(_GAME_JSON_PATH(game_uuid)) == 0:
        raise SystemError(f"Specified game {game_uuid} is corrupted.")

    with open(_GAME_JSON_PATH(game_uuid)) as game_json:
        return Game.model_construct(**json.load(game_json, cls=CustomDecoder))


def game_exists(game_uuid: int) -> bool:
    try:
        get_game(game_uuid)
        return True
    except ValueError:
        return False
    

def add_game(new_game: Game) -> int:
    """
    Creates a new game.
    Any specified challenge or participant is not stored, they have their own access methods.
    Uuid generation is done in the backend, so the uuid passed by the caller is ignored.
    The newly generated uuid is returned and also used to overwrite the game_uuid property in the new_game argument.
    """
    # Generate secure uuid.
    uuid = _generate_uuid()
    new_game.game_uuid = uuid
    new_game.participant_uuids = set()
    new_game.supported_challenge_uuids = set()

    # Create directory to save all the game data in.
    os.makedirs(_GAME_DIRECTORY(uuid))
    os.makedirs(_CHALLENGE_SUBMISSIONS_DATA_DIRECTORY(uuid))

    # Save data in game.json
    _save_game(new_game)

    return uuid


def delete_game(game_uuid: int):
    """
    Deletes a game. Also deletes all associated saved data.
    If the specified game does not exist, throws a ValueError.
    """
    if not os.path.exists(_GAME_DIRECTORY(game_uuid)):
        raise ValueError("The specified game does not exist.")
    shutil.rmtree(_GAME_DIRECTORY(game_uuid))  # Recursively removes the entire directory, all its subfolders and files.


def update_game(game_uuid: int, updated_game: Game):
    """
    Attempts to change the uuid will not work, the old uuid will be kept, and put in the game_uuid field of the updated_game argument.
    Changes to supported_challenge_uuids or participant_uuids are ignored, they have their own access methods.
    Raises a ValueError if the specified game does not exist.
    """
    game = get_game(game_uuid)

    # Repair the uuid, convert to dict, and replace old values with these new ones.
    updated_game.game_uuid = game_uuid
    updated_game_as_dict = updated_game.model_dump()
    updated_game_as_dict.pop("participant_uuids")
    updated_game_as_dict.pop("supported_challenge_uuids")
    game = Game.model_construct(**dict(game.model_dump(), updated_game_as_dict))

    # Save data in game.json
    _save_game(game)


"""
--------------------------------------------------------------------------------------------------------------------------------------------------------
----------------------------------------------------------------- Game Participant Info ----------------------------------------------------------------
--------------------------------------------------------------------------------------------------------------------------------------------------------
"""

def _save_participants(game_uuid: int, participants: dict[str | int, dict | GameParticipant]):
    with open(_PARTICIPANTS_JSON_PATH(game_uuid), 'w+') as user_file:
        json.dump(participants, user_file, indent=4, cls=CustomEncoder)


def get_game_participants(game_uuid: int) -> dict[int, GameParticipant]:
    """
    Get all participants of a game.
    returns it as a dict, keyed by user_uuid.
    """
    if not os.path.exists(_GAME_DIRECTORY(game_uuid)):
            raise ValueError("Specified game does not exist.")
    if not os.path.exists(_PARTICIPANTS_JSON_PATH(game_uuid)):
        return {}
    if os.path.getsize(_PARTICIPANTS_JSON_PATH(game_uuid)) == 0:  # Empty file.
        return {}

    # Reads the participants.json file as a dict keyed by uuid.
    with open(_PARTICIPANTS_JSON_PATH(game_uuid)) as user_file:
        loaded_dict: dict[str, dict] = json.load(user_file, cls=CustomDecoder)
    return {int(key): GameParticipant.model_construct(**value) for (key, value) in loaded_dict.items()}


def get_game_participant(game_uuid: int, user_uuid: int) -> GameParticipant:
    """
    Gets a participant of a game.
    If the specified game does not exist, throws a ValueError.
    If the specified participant is not a part of the game, throws a ValueError.
    """
    participants_dict = get_game_participants(game_uuid)
    if user_uuid not in participants_dict:
        print(user_uuid)
        print(participants_dict)
        raise ValueError("Specified user is not a part of the specified game.")
    return participants_dict[user_uuid]


def participant_exists(game_uuid: int, participant_uuid: int) -> bool:
    return participant_uuid in get_game_participants(game_uuid)


def add_game_participant(game_uuid: int, participant: GameParticipant):
    """
    Allows a user to join a game as a participant.
    Also adds the game to the user's games.
    If the specified game does not exist, throws a ValueError.
    If the specified player does not exist, throws a ValueError.
    If the specified player is already in the game, throws a ValueError.
    """
    # Add user to game.
    if not user_exists(participant.user_uuid):
        raise ValueError("Specified user does not exist.")
    if participant_exists(game_uuid, participant.user_uuid):
        raise ValueError("Specified user is already in the game.")
    participants = get_game_participants(game_uuid)
    participants[participant.user_uuid] = participant
    _save_participants(game_uuid, participants)
    # Add the participant to game.json.
    game = get_game(game_uuid)
    added_participant = {"participant_uuids" : game.participant_uuids}
    added_participant["participant_uuids"].add(participant.user_uuid)
    updated_game_dict = game.model_dump()
    updated_game_dict.update(added_participant)
    game = Game.model_construct(**updated_game_dict)
    _save_game(game)

    # Save data in game.json
    with open(_GAME_JSON_PATH(game_uuid), 'w+') as game_file:
        json.dump(game, game_file, indent=4, cls=CustomEncoder)


    # Add game to user.
    users = get_all_users()
    users[participant.user_uuid].game_uuids.add(game_uuid)
    _save_users(users)


def delete_game_participant(game_uuid: int, user_uuid: int):
    """
    Deletes a game participant.
    Also deletes the game from the users profile.
    If this is the last player of the game, deletes the game as well.
    Does not delete all associated saved data as that might invalidate coop or contest challenges.
    If the specified participant was not a part of this game, throws a ValueError.
    """
    # Remove user from game.
    if not participant_exists(game_uuid, user_uuid):
        raise ValueError("The specified participant is not a part of the specified game.")
    participants = get_game_participants(game_uuid)
    participants.pop(user_uuid)
    _save_participants(game_uuid, participants)
    # Remove the participant from game.json.
    game = get_game(game_uuid)
    removed_participant = {"participant_uuids" : game.participant_uuids}
    removed_participant["participant_uuids"].remove(user_uuid)

    updated_dict = game.model_dump()
    updated_dict.update(removed_participant)
    game = Game.model_construct(**updated_dict)
    _save_game(game)

    # Delete game if no participants are left.
    # if len(participants) == 0:
    #     delete_game(game_uuid)

    # Remove game from participant.
    users = get_all_users()
    users[user_uuid].game_uuids.remove(game_uuid)
    _save_users(users)


def update_game_participant(game_uuid: int, user_uuid: int, updated_participant: GameParticipant):
    """
    Updates a participants data.
    For example to start a new challenge, or complete one.
    Attempts to change the uuid will not work, the old uuid will be kept, and put in the user_uuid field of the updated_participant argument.
    """
    participants = get_game_participants(game_uuid)

    if not user_uuid in participants:
        raise ValueError("The specified participant is not a part of the specified game.")

    updated_participant.user_uuid = user_uuid

    participants[user_uuid] = dict(updated_participant)
    _save_participants(game_uuid, participants)

"""
--------------------------------------------------------------------------------------------------------------------------------------------------------
--------------------------------------------------------------------- Challenge Info -------------------------------------------------------------------
--------------------------------------------------------------------------------------------------------------------------------------------------------
"""

def _save_challenges(game_uuid: int, challenges: dict[str | int, dict | Challenge]):
    with open(_CHALLENGES_JSON_PATH(game_uuid), 'w+') as challenge_file:
        json.dump(challenges, challenge_file, indent=4, cls=CustomEncoder)


def get_challenges(game_uuid: int) -> dict[int, Challenge]:
    """
    Get all challenges of a game.
    returns it as a dict, keyed by challenge_uuid.
    Throws a ValueError if the game does not exist.
    """
    if not os.path.exists(_GAME_DIRECTORY(game_uuid)):
            raise ValueError("Specified game does not exist.")
    if not os.path.exists(_CHALLENGES_JSON_PATH(game_uuid)):
        return {}
    if os.path.getsize(_CHALLENGES_JSON_PATH(game_uuid)) == 0:  # Empty file.
        return {}

    # Reads the participants.json file as a dict keyed by uuid.
    with open(_CHALLENGES_JSON_PATH(game_uuid)) as challenge_file:
        loaded_data: dict[str, dict] = json.load(challenge_file, cls=CustomDecoder)
    return {int(key): Challenge.model_construct(**value) for (key, value) in loaded_data.items()}


def challenge_exists(game_uuid: int, challenge_uuid: int) -> bool:
    return challenge_uuid in get_challenges(game_uuid)


def get_challenge(game_uuid: int, challenge_uuid: int) -> Challenge:
    """
    Gets a challenge of a game.
    Throws a ValueError if the game does not exist.
    Throws a ValueError if the challenge does not exist.
    """
    challenges = get_challenges(game_uuid)
    if challenge_uuid not in challenges:
        raise ValueError("Specified challenge does not exist.")
    return challenges[challenge_uuid]


def add_supported_challenge(game_uuid: int, new_challenge: Challenge) -> int:
    """
    Adds a challenge to a game.
    Uuid generation is done in the backend, so the uuid passed by the caller is ignored.
    The newly generated uuid is returned and also used to overwrite the challenge_uuid property in the new_challenge argument.
    Throws a ValueError if the game does not exist.
    """
    new_challenge.challenge_uuid = _generate_uuid()  # Overwrite uuid with securely generated one.
    new_challenge_as_dict = new_challenge.model_dump()  # Convert to dictionary.

    # Add new challenge to all challenges.
    challenge_dict = get_challenges(game_uuid)
    challenge_dict[new_challenge.challenge_uuid] = new_challenge_as_dict
    _save_challenges(game_uuid, challenge_dict)
    # Add the challenge to game.json.
    game = get_game(game_uuid)
    added_challenge = {"supported_challenge_uuids" : game.supported_challenge_uuids}
    added_challenge["supported_challenge_uuids"].add(new_challenge.challenge_uuid)
    updated_dict = game.model_dump()
    updated_dict.update(added_challenge)
    game = Game.model_construct(**updated_dict)
    _save_game(game)

    return new_challenge.challenge_uuid
    

def delete_challenge(game_uuid: int, challenge_uuid: int):
    """
    Deletes a challenge. Deletes all instances of that challenge that have been started or completed already.
    Throws a ValueError if the game does not exist.
    Throws a ValueError if the challenge does not exist.
    """
    challenge_dict = get_challenges(game_uuid)

    if challenge_uuid not in challenge_dict:
        raise ValueError("Challenge does not exist.")

    # Delete challenge from game.
    challenge_dict.pop(challenge_uuid)
    _save_challenges(game_uuid, challenge_dict)
    # Remove the challenge from game.json.
    game = get_game(game_uuid)
    removed_challenge = {"supported_challenge_uuids" : game.supported_challenge_uuids}
    removed_challenge["supported_challenge_uuids"].remove(challenge_uuid)
    game = Game.model_construct(**dict(game.model_dump(), removed_challenge))
    _save_game(game)

    # Delete challenge instances.
    challenge_instances = get_challenge_instances()
    for challenge_instance in challenge_instances.values():
        if challenge_instance.challenge_uuid is not challenge_uuid:
            continue
        delete_challenge_instance(game_uuid, challenge_instance.challenge_uuid)


def update_supported_challenge(game_uuid: int, challenge_uuid: int, updated_challenge: Challenge):
    """
    Updates a challenges data.
    Throws a ValueError if the game does not exist.
    Throws a ValueError if the challenge does not exist.
    Attempts to change the Challenge uuid are ignored, the old uuid is kept and put in the challenge_uuid field of the updated_challenge argument.
    """
    challenge_dict = get_challenges(game_uuid)

    if challenge_uuid not in challenge_dict:
        raise ValueError("Challenge does not exist.")

    # Repair the uuid, convert to dict, and replace old values with these new ones.
    updated_challenge.challenge_uuid = challenge_uuid
    updated_challenge_as_dict = updated_challenge.model_dump()
    new_value = Challenge.model_construct(**dict(challenge_dict[challenge_uuid].model_dump(), updated_challenge_as_dict))
    challenge_dict[challenge_uuid] = new_value
    _save_challenges(challenge_dict)

    for challenge_instance in get_challenge_instances(game_uuid).values():
        if challenge_instance.challenge_uuid == challenge_uuid:
            challenge_instance.update_leaderboard(game_uuid, get_game_participants(game_uuid).values(), new_value, [get_challenge_submission(game_uuid, uuid) for uuid in challenge_instance.challenge_submission_uuids])
            update_challenge_instance(game_uuid, challenge_instance.challenge_instance_uuid, challenge_instance)

"""
--------------------------------------------------------------------------------------------------------------------------------------------------------
----------------------------------------------------------------- Challenge Instance Info --------------------------------------------------------------
--------------------------------------------------------------------------------------------------------------------------------------------------------
"""

def _save_challenge_instances(game_uuid: int, challenge_instances: dict[str | int, dict]):
    with open(_CHALLENGE_INSTANCES_JSON_PATH(game_uuid), 'w+') as challenge_instances_file:
        json.dump(challenge_instances, challenge_instances_file, indent=4, cls=CustomEncoder)


def get_challenge_instances(game_uuid: int) -> dict[int, ChallengeInstance]:
    """
    Gets all challenge instances of a game as a dict, keyed by challenge_instance_uuid.
    Throws a ValueError if the game does not exist.
    """
    if not os.path.exists(_GAME_DIRECTORY(game_uuid)):
        raise ValueError("Specified game does not exist.")
    if not os.path.exists(_CHALLENGE_INSTANCES_JSON_PATH(game_uuid)):
        return {}
    if os.path.getsize(_CHALLENGE_INSTANCES_JSON_PATH(game_uuid)) == 0:  # Empty file.
        return {}

    # Reads the participants.json file as a dict keyed by uuid.
    with open(_CHALLENGE_INSTANCES_JSON_PATH(game_uuid)) as challenge_instances_file:
        loaded_data: dict[str, dict] = json.load(challenge_instances_file, cls=CustomDecoder)
    return {int(key): ChallengeInstance.model_construct(**value) for (key, value) in loaded_data.items()}


def get_challenge_instance(game_uuid: int, challenge_instance_uuid: int) -> ChallengeInstance:
    """
    Gets a challenge instance of a game.
    Throws a ValueError if the game does not exist.
    Throws a ValueError if the challenge instance does not exist.
    """
    challenge_instances = get_challenge_instances(game_uuid)
    if challenge_instance_uuid not in challenge_instances:
        raise ValueError("Specified challenge instance does not exist.")
    return challenge_instances[challenge_instance_uuid]


def challenge_instance_exists(game_uuid: int, challenge_instance_uuid: int) -> bool:
    return challenge_instance_uuid in get_challenge_instances(game_uuid)


def add_challenge_instance(game_uuid: int, new_challenge_instance: ChallengeInstance) -> int:
    """
    Adds a challenge instance to a game.
    Throws a ValueError if the game does not exist.
    Throws a ValueError if the challenge this challenge instance refers to does not exist.
    Participant_uuids and challenge_submission_uuids are ignored, they have their own access methods.
    Uuid generation is done in the backend, so the uuid passed by the caller is ignored.
    The newly generated uuid is returned and also used to overwrite the challenge_instance_uuid property in the new_challenge_instance argument.
    """
    new_challenge_instance.challenge_instance_uuid = _generate_uuid()  # Overwrite uuid with securely generated one.
    if not challenge_exists(game_uuid, new_challenge_instance.challenge_uuid):
        raise ValueError("Tried creating a new challenge instance, but the challenge this is based on does not exist.")
    new_challenge_instance.participant_uuids = set()
    new_challenge_instance.challenge_submission_uuids = set()
    new_challenge_instance.update_leaderboard(get_game_participants(game_uuid).values(), get_challenge(game_uuid, new_challenge_instance.challenge_uuid), [])

    # Add new challenge to all challenges.
    challenge_instances_dict = get_challenge_instances(game_uuid)
    challenge_instances_dict[new_challenge_instance.challenge_instance_uuid] = new_challenge_instance

    _save_challenge_instances(game_uuid, challenge_instances_dict)
    return new_challenge_instance.challenge_instance_uuid


def delete_challenge_instance(game_uuid: int, challenge_instance_uuid: int):
    """
    Deletes a challenge instance.
    Also deletes all associated challenge submissions and their data.
    Also deletes this challenge instance from all of its participants.
    Throws a ValueError if the game does not exist.
    Throws a ValueError if the challenge instance does not exist.
    """
    challenge_instances_dict = get_challenge_instances(game_uuid)

    if challenge_instance_uuid not in challenge_instances_dict:
        raise ValueError("Challenge instance does not exist.")

    # Delete challenge instance from game, delete all associated challenge submissions as well.
    challenge_instance = challenge_instances_dict.pop(challenge_instance_uuid)
    for uuid in challenge_instance.challenge_submission_uuids:
        delete_challenge_submission(game_uuid, challenge_instance_uuid, uuid)
    _save_challenge_instances(game_uuid, challenge_instances_dict)

    # Delete challenge instance from its participants.
    for participant_uuid in challenge_instance.participant_uuids:
        participant = get_game_participant(game_uuid, participant_uuid)
        participant.challenge_instance_uuids.remove(challenge_instance_uuid)
        update_game_participant(game_uuid, participant.user_uuid, participant)


def update_challenge_instance(game_uuid: int, challenge_instance_uuid: int, updated_challenge_instance: ChallengeInstance):
    """
    Updates a challenge instances data.
    Throws a ValueError if the game does not exist.
    Throws a ValueError if the challenge instance does not exist.
    Attempts to change the Challenge instance uuid are ignored, the old uuid is kept and put in the challenge_instance_uuid field of the updated_challenge_instance argument.
    Attempts to change the Game uuid or Challenge uuid are ignored. Just please don't try this as it would be a mess.
    Attempts to change participant_uuids or challenge_submission_uuids are ignored, they have their own access methods.
    """
    challenge_instances_dict = get_challenge_instances(game_uuid)

    if challenge_instance_uuid not in challenge_instances_dict:
        raise ValueError("Challenge instance does not exist.")

    # Repair the uuid, convert to dict, and replace old values with these new ones.
    updated_challenge_instance.challenge_instance_uuid = challenge_instance_uuid
    changes_dict = updated_challenge_instance.model_dump()
    changes_dict.pop("game_uuid")
    changes_dict.pop("challenge_uuid")
    changes_dict.pop("participant_uuids")
    changes_dict.pop("challenge_submission_uuids")

    total_dict =  challenge_instances_dict[challenge_instance_uuid].model_dump()
    total_dict.update(changes_dict)
    challenge_instance = ChallengeInstance.model_construct(**total_dict)
    challenge_instance.update_leaderboard(get_game_participants(game_uuid).values(), get_challenge(game_uuid, challenge_instance.challenge_uuid), [get_challenge_submission(game_uuid, uuid) for uuid in challenge_instance.challenge_submission_uuids])
    challenge_instances_dict[challenge_instance_uuid] = challenge_instance
    _save_challenge_instances(game_uuid, challenge_instances_dict)


def add_challenge_participant(game_uuid: int, challenge_instance_uuid: int, participant_uuid: int):
    """
    Allows a participant to join a challenge instance.
    Also adds this challenge to the participant's data, in the challenge_instance_uuids field.
    Throws a ValueError if the game does not exist.
    Throws a ValueError if the challenge instance does not exist.
    Throws a ValueError if the participant does not exist.
    Throws a ValueError if the participant is already a part of this challenge instance.
    """
    if not challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise ValueError("Challenge instance does not exist.")
    if not participant_exists(game_uuid, participant_uuid):
        raise ValueError("Participant does not exist in the specified game.")

    challenge_instances = get_challenge_instances(game_uuid)
    if participant_uuid in challenge_instances[challenge_instance_uuid].participant_uuids:
        raise ValueError("Participant already partakes in the specified challenge instance.")
    challenge_instances[challenge_instance_uuid].participant_uuids.add(participant_uuid)
    challenge_instances[challenge_instance_uuid].update_leaderboard(get_game_participants(game_uuid).values(), get_challenge(game_uuid, challenge_instances[challenge_instance_uuid].challenge_uuid), [get_challenge_submission(game_uuid, uuid) for uuid in challenge_instances[challenge_instance_uuid].challenge_submission_uuids])
    _save_challenge_instances(game_uuid, challenge_instances)

    # add challenge instance to participant data.
    participant = get_game_participant(game_uuid, participant_uuid)
    participant.challenge_instance_uuids.add(challenge_instance_uuid)
    update_game_participant(game_uuid, participant_uuid, participant)
    

def delete_challenge_participant(game_uuid: int, challenge_instance_uuid: int, participant_uuid: int):
    """
    Allows a participant to leave a challenge instance.
    Also removes this challenge from the participant's data.
    If this is the last participant, removes the challenge instance.
    This means that challenge instances can have a number of participants below the minimum count. In this case, no points are awarded to anyone.
    Throws a ValueError if the game does not exist.
    Throws a ValueError if the challenge instance does not exist.
    Throws a ValueError if the participant does not exist.
    Throws a ValueError if the participant is not a part of this challenge instance.
    """
    if not challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise ValueError("Challenge instance does not exist.")
    if not participant_exists(game_uuid, participant_uuid):
        raise ValueError("Participant does not exist in the specified game.")

    challenge_instances = get_challenge_instances(game_uuid)
    if participant_uuid not in challenge_instances[challenge_instance_uuid].participant_uuids:
        raise ValueError("Participant does not partake in the specified challenge instance.")
    challenge_instances[challenge_instance_uuid].participant_uuids.remove(participant_uuid)

    # If this is the last participant, remove the challenge instance.
    if len(challenge_instances[challenge_instance_uuid].participant_uuids) == 0:
        delete_challenge_instance(game_uuid, challenge_instance_uuid)
    else:
        _save_challenge_instances(game_uuid, challenge_instances)
        # remove challenge instance from participant data.
        participant = get_game_participant(game_uuid, participant_uuid)
        participant.challenge_instance_uuids.remove(challenge_instance_uuid) 
        update_game_participant(game_uuid, participant_uuid, participant)


def _save_challenge_submissions(game_uuid: int, challenge_submissions: dict[str | int, dict | ChallengeSubmission]):
    with open(_CHALLENGE_SUBMISSIONS_JSON_PATH(game_uuid), 'w+') as challenge_submissions_file:
        json.dump(challenge_submissions, challenge_submissions_file, indent=4, cls=CustomEncoder)


def get_challenge_submissions(game_uuid: int) -> dict[int, ChallengeSubmission]:
    """
    Gets all challenge instances of a game as a dict, keyed by challenge_instance_uuid.
    Throws a ValueError if the game does not exist.
    Throws a ValueError if the challenge submission does not exist.
    """
    if not os.path.exists(_GAME_DIRECTORY(game_uuid)):
        raise ValueError("Specified game does not exist.")
    if not os.path.exists(_CHALLENGE_SUBMISSIONS_JSON_PATH(game_uuid)):
        return {}
    if os.path.getsize(_CHALLENGE_SUBMISSIONS_JSON_PATH(game_uuid)) == 0:  # Empty file.
        return {}

    # Reads the participants.json file as a dict keyed by uuid.
    with open(_CHALLENGE_SUBMISSIONS_JSON_PATH(game_uuid)) as challenge_submissions_file:
        loaded_data = json.load(challenge_submissions_file, cls=CustomDecoder)
    return {int(key): ChallengeSubmission.model_construct(**value) for (key, value) in loaded_data.items()}


def get_challenge_submission(game_uuid: int, submission_uuid: int) -> ChallengeSubmission:
    """
    Gets a challenge submission of a challenge instance.
    Throws a ValueError if the game does not exist.
    Throws a ValueError if the challenge instance does not exist.
    Throws a ValueError if the challenge submission does not exist.
    """
    return get_challenge_submissions(game_uuid)[submission_uuid]


def challenge_submission_exists(game_uuid: int, challenge_submission_uuid: int) -> bool:
    return challenge_submission_uuid in get_challenge_submissions(game_uuid)


def get_challenge_submission_filename_from_file(file: UploadFile) -> str:
    return str(hash(file.file)) + "." + file.filename.split('.')[-1]  # filename: hash + original file extension


def get_challenge_submission_full_path_from_filename(game_uuid: int, filename: str) -> str:
    return os.path.join(_CHALLENGE_SUBMISSIONS_DATA_DIRECTORY(game_uuid), filename)


def add_challenge_submission(game_uuid: int, challenge_instance_uuid: int, submission: ChallengeSubmissionUpload | ChallengeSubmission) -> int:
    """
    Adds a challenge submission to a challenge instance.
    Throws a ValueError if the game does not exist.
    Throws a ValueError if the challenge instance does not exist.
    Uuid generation is done in the backend, so the uuid passed by the caller is ignored.
    The newly generated uuid is returned and also used to overwrite the challenge_instance_uuid property in the new_challenge_instance argument.
    """

    if not challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise ValueError("Challenge instance does not exist.")

    # generate secure uuid.
    submission.challenge_submission_uuid = _generate_uuid()

    if not isinstance(submission, ChallengeSubmission):
        # Convert to internal representation.
        challenge_submission = ChallengeSubmission(challenge_submission_uuid=submission.challenge_submission_uuid,
                                                   participant_uuid=submission.participant_uuid,
                                                   submitted_time=submission.submitted_time,
                                                   description=submission.description,
                                                   data=[],
                                                   contest_entry=submission.contest_entry)
        for data_instance in submission.data:
            filename = get_challenge_submission_filename_from_file(data_instance)
            with open(get_challenge_submission_full_path_from_filename(game_uuid, filename), 'wb+') as file:
                file.write(data_instance.file.read())
            challenge_submission.data.append(filename)
        submission = challenge_submission

    challenge_submissions = get_challenge_submissions(game_uuid)
    challenge_submissions[submission.challenge_submission_uuid] = submission
    _save_challenge_submissions(game_uuid, challenge_submissions)

    # add challenge submission to challenge instance.
    challenge_instances = get_challenge_instances(game_uuid)
    challenge_instances[challenge_instance_uuid].challenge_submission_uuids.add(submission.challenge_submission_uuid)
    challenge_instances[challenge_instance_uuid].update_leaderboard(get_game_participants(game_uuid).values(), get_challenge(game_uuid, challenge_instances[challenge_instance_uuid].challenge_uuid), [get_challenge_submission(game_uuid, uuid) for uuid in challenge_instances[challenge_instance_uuid].challenge_submission_uuids])
    _save_challenge_instances(game_uuid, challenge_instances)

    return submission.challenge_submission_uuid


def delete_challenge_submission(game_uuid: int, challenge_instance_uuid: int, submission_uuid: int):
    """
    Removes a challenge submission from a challenge instance.
    Also deletes all data associated with it.
    Throws a ValueError if the game does not exist.
    Throws a ValueError if the challenge instance does not exist.
    Throws a ValueError if the challenge submission does not exist.
    """
    if not challenge_submission_exists(game_uuid, submission_uuid):
        raise ValueError("Specified challenge submission does not exist.")
    if not challenge_instance_exists(game_uuid, challenge_instance_uuid):
        raise ValueError("Specified challenge instance does not exist.")
    challenge_submissions_dict = get_challenge_submissions(game_uuid)
    challenge_submission = challenge_submissions_dict.pop(submission_uuid)

    # Delete challenge submission from game.
    _save_challenge_submissions(game_uuid, challenge_submissions_dict)

    # Delete challenge submission from its challenge_instance.
    challenge_instances = get_challenge_instances(game_uuid)
    challenge_instances[challenge_instance_uuid].challenge_submission_uuids.remove(submission_uuid)
    challenge_instances[challenge_instance_uuid].update_leaderboard(get_game_participants(game_uuid).values(), get_challenge(game_uuid, challenge_instances[challenge_instance_uuid].challenge_uuid), [get_challenge_submission(game_uuid, uuid) for uuid in challenge_instances[challenge_instance_uuid].challenge_submission_uuids])
    _save_challenge_instances(game_uuid, challenge_instances)

    # Delete challenge submission data
    for data_instance in challenge_submission.data:
        os.remove(get_challenge_submission_full_path_from_filename(game_uuid, data_instance))


"""
--------------------------------------------------------------------------------------------------------------------------------------------------------
------------------------------------------------------------------ Additional Management ---------------------------------------------------------------
--------------------------------------------------------------------------------------------------------------------------------------------------------
"""


def check_database_invariants():
    """
    Invariants:
    - all user.game_uuids refer to a valid game
    - all user.profile_picture_path refer to a valid pfp path
    - all game.participant_uuids refer to a valid participant and user
    - all games have at least one valid participant and they are referenced in the other direction as well
    - all game.supported_challenge_uuids refer to a valid challenge
    - all game_participant.user_uuid refer to a valid user
    - all game_participant.challenge_instance_uuids refer to a valid challenge instance
    - all challenges (that support this format) must have their min_player_count <= their max_player_count (can I do this in pydantic?)
    - all challenge_instance.challenge_uuid refer to a valid challenge of that game
    - all challenge_instance.participant_uuids refer to a valid participant, and they are referenced in the other direction as well
    - all challenge_instance.challenge_submission_uuids refer to a valid participant, and they are referenced in the other direction as well
    - all challenge_instance.start_time are below their complete_time, if a complete_time is present
    - all challenge_instance have at least one valid participant
    - all challenge_submission.challenge_instance_uuid refer to a valid challenge instance
    - all challenge_submission.participant_uuid refer to a valid participant
    - all challenge_submission.data refer to valid stored data

    Database invariants should ensure data validity. Any additional invariants that are part of the game rules should be enforced, but not in this method.
    """
    raise NotImplementedError()


if __name__ == "__main__":
    
    reset_directory_structure()

    # Create a new game.
    game = Game(game_uuid=0, name="Erasmus Hanne", participant_uuids=set(), supported_challenge_uuids=set())
    game.game_uuid = add_game(game)

    challenges = []

    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Art-tour", description="Photograph 15 works of street art.", availability_conditions="", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="You're a beast", description="Shatter your PR (running, cycling, ...)", availability_conditions="", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Quite a way to bike", description="Make a 40km bike ride.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Quite a way to walk", description="Make a 20km walk.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="This ain't no circus", description="Learn to juggle.\nAt least 3 balls, for 15 seconds.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Do not skip the warmup", description="Perform a rope skipping routine during one song.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="There ain't no shame in this", description="Turn your music to the max and do a dance in the streets.", availability_conditions="", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Rubics-pro", description="Solve a rubics cube.\nProvide video evidence.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Let's remember this", description="Make a highlights video of your semester.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Patriot or treason?", description="Sing or Play the Finnish national anthem.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="National literature", description="Read 'Kalevala'.\nIn English or Dutch is fine.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Musical genius", description="Play a song on a 'Kantele'.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="National sport", description="Play a game of 'Pesäpallo'.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="National animal", description="Take a picture with the national animal of Finland.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Conquerors", description="Take a viking themed picture.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Mass migration", description="Gather as many pieces of video of friends/family saying something in Finnish.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Why did that change?", description="Find something silly that changed during the semester (for example a wall that has been repainted) and make a video of at least two minutes about why this is absolutely unacceptable.", availability_conditions="", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="You learn something new every day", description="Learn a fun fact from a (very) different study field and share your newfound knowledge.", availability_conditions="", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Pushing boundaries", description="Go to an event you would normally never go to, and have fun.\nIf you are unsure, let someone else pick out the event for you.", availability_conditions="", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Animal lover", description="Meet 3 new pets/animals.\nEach animal should be met on a different occasion, meeting 3 animals from one owner does not count.", availability_conditions="", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    # Leuven challenges.
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Campus-tour", description="Visit each university campus in Leuven.", availability_conditions="LOCATION IS \"LEUVEN\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Dorm-tour", description="Visit each dorm from a member of the pitaclub and Storm.\nPictures from the outside are fine.", availability_conditions="LOCATION IS \"LEUVEN\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Switcheroo", description="Take a selfie with a Finnish exchange student.\nThis challenge is repeatable, but the exchange student should be different each time.", availability_conditions="LOCATION IS \"LEUVEN\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Moochie lover", description="Take a picture of the weekly Moochie flavors for four consecutive weeks.", availability_conditions="LOCATION IS \"LEUVEN\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    # Mechelen challenges.
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Moochie lover à Malines", description="Take a picture of the weekly Moochie flavors for four weeks.\nThe pictures do not have to be taken in consecutive weeks.", availability_conditions="LOCATION IS \"BELGIUM\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    # Belgium challenges.
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="River-Ride", description="Cycle from Leuven to Mechelen (or the other way) by bike, via the Dijle.", availability_conditions="LOCATION IS \"BELGIUM\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Dusk Till Dawn", description="Document the fact that Belgium does not experience a polar night:\n - either by making a timelapse in which the sun comes up and goes down again.\n - or by making a video of the highest point of the sun for a week/month/semester (worth more points)", availability_conditions="LOCATION IS \"BELGIUM\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Belgian Fauna", description="Take a picture of an animal that is not found in Finland.", availability_conditions="LOCATION IS \"BELGIUM\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Belgian Flora", description="Take a picture of 3 plants that are not found in Finland.", availability_conditions="LOCATION IS \"BELGIUM\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="enFin(land)", description="Cook something from the Finnish cuisine.", availability_conditions="LOCATION IS \"BELGIUM\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Languages 101", description="Learn to order something in a new language of your choice, and practice it at an authentic restaurant.\nEnglish, French or German are not allowed.\nThis challenge is repeatable, if a new language is learned each time.", availability_conditions="LOCATION IS \"BELGIUM\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Languages 202", description="Read a book or learn a song in the language of you chose for 'Languages 101'.", availability_conditions="LOCATION IS \"BELGIUM\" AND \"LANGUAGES 101\" IS COMPLETED", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Languages at work", description="Take an \"anamnese\" from a stuffed animal in the language you chose for 'Languages 101.", availability_conditions="LOCATION IS \"BELGIUM\" AND \"LANGUAGES 101\" IS COMPLETED", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    # Jyvaskyla challenges.
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="The clothes make the woman", description="Buy a piece of clothing from the university of Jyväskylä.", availability_conditions="LOCATION IS \"JYVÄSKYLÄ\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Inside-out", description="Visit 5 different public outdoor spaces (parks, forests etc.) and 5 different public indoor spaces (pools, saunas, town hall, library etc.).", availability_conditions="LOCATION IS \"JYVÄSKYLÄ\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Second hand", description="Go to a flee market and take something home.", availability_conditions="LOCATION IS \"JYVÄSKYLÄ\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Event-ually you'll fit in", description="Go to an event in Finland.\n University-organised events do not count.", availability_conditions="LOCATION IS \"JYVÄSKYLÄ\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Dancing with the stars", description="Teach your fellow students 'het smidje', 'de plopdans' or other typically Belgian dances.", availability_conditions="LOCATION IS \"JYVÄSKYLÄ\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Tastes like home", description="Cook something typically Belgian for your fellow students.", availability_conditions="LOCATION IS \"JYVÄSKYLÄ\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Tastes like heaven", description="Bake cinnamon rolls.", availability_conditions="LOCATION IS \"JYVÄSKYLÄ\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    # Finland challenges.
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Aquaphile", description="Do some water sport.\nA casual swim does not count, but swimming for sport does. Sports other than swimming are worth double points.\nThe challenge is repeatable, if a different sport is done each time.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Polar night", description="Document the fact that Finland does experience a polar night:\n - either by making a timelapse in which the sun does not (propely) come up the entire day.\n - or by making a video of the highest point of the sun for a week/month/semester (worth more points)", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="We are different after all", description="Describe a difference between the Finnish and Belgian way of living.\nThis can be done very seriously, or be filled with bullshit. It can be a very wide topic or a very specific detail.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Hel-see-nki", description="Take a trip to Helsinki and make a vlog.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="1000-star hotel", description="Sleep under the open sky, or in a tent, take a picture of the stars.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Food critic", description="Try and rate ten different cinnamon rolls.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Who's a good girl", description="Go on a trip by dog-sled", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="It's... beautiful", description="Photograph the northern lights", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[5], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Finnish Fauna", description="Take a picture of an animal that is not found in Belgium.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Finnish Flora", description="Take a picture of 3 plants that are not found in Belgium.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Finnish 101", description="Learn to greet people in the streets and make 3 Finnish friends by talking Finnish.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Finnish 202", description="Learn to order something in a restaurant in Finnish and enjoy your well-deserved meal/drink.", availability_conditions="LOCATION IS \"FINLAND\" AND \"FINNISH 101\" IS COMPLETED", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Finnish 303", description="Learn someones birthday, and wish them a happy birthday (on the right day) in Finnish.", availability_conditions="LOCATION IS \"FINLAND\" AND \"FINNISH 202\" IS COMPLETED", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Finnish 404", description="Read a book in Finnish (this can be a childrens book) or learn a song in Finnish.", availability_conditions="LOCATION IS \"FINLAND\" AND \"FINNISH 303\" IS COMPLETED", points_rewarded=[1], repeatable=True, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Finnish at work", description="Take an \"anamnese\" from a stuffed animal in Finnish.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Now this is literature", description="Read \'Moominvalley\' and defend that poor troll with your life anytime someone says something negative about them.", availability_conditions="LOCATION IS \"FINLAND\" AND \"FINNISH 303\" IS COMPLETED", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    ## Visiting Hanne challenges.
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Hide and seek", description="Hide as many objects at the apartment as you can, points for any object not noticed by Hanne.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Did someone call a mover?", description="Move as many objects at the apartment as you can, points for any object not noticed by Hanne.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Is someone in there?", description="Knock on any door you (want to) go through, even if it is already open. The longer it takes Hanne to notice, the more points you get.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="All the colors of the rainbow", description="Name the color of objects at the apartment, until Hanne notices or you have named every color of the rainbow, including black and white.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Got you", description="Bring Hanne a \"gefopt\" gift.", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Solo, challenge_uuid=0, game_uuid=game.game_uuid, name="Why would someone put that there?", description="Choose an object at the apartment and go on about how it's a weird object/it doesn't belong there/...\nYou can really hyperfixate on the object :P", availability_conditions="LOCATION IS \"FINLAND\"", points_rewarded=[1], repeatable=False, time_limit=None, leaderboard_ordering=None, contest_entry_type=None))

    challenges.append(Challenge(type=ChallengeType.Coop, challenge_uuid=0, game_uuid=game.game_uuid, name="Matching outfits", description="Buy a matching outfit or piece of clothing, at the same time.", availability_conditions="", points_rewarded=[1], repeatable=True, time_limit=None, min_participants_count=2, max_participants_count=8, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Coop, challenge_uuid=0, game_uuid=game.game_uuid, name="National orchestra", description="Play the Finnish national anthem together.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, min_participants_count=2, max_participants_count=8, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Coop, challenge_uuid=0, game_uuid=game.game_uuid, name="Sports team", description="Perform a relay race.", availability_conditions="", points_rewarded=[1], repeatable=True, time_limit=None, min_participants_count=1, max_participants_count=2, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Coop, challenge_uuid=0, game_uuid=game.game_uuid, name="Christmas spirit", description="Make a nativity scene together, in such a way that it is identifiable who made each piece, or where it was made.\nFor example: Jesus is dressed in typical Finnish atire, or Mary looks like the person making her.", availability_conditions="", points_rewarded=[10], repeatable=False, time_limit=None, min_participants_count=2, max_participants_count=8, leaderboard_ordering=None, contest_entry_type=None))
    challenges.append(Challenge(type=ChallengeType.Coop, challenge_uuid=0, game_uuid=game.game_uuid, name="Hobby-switch", description="Try the hobby of the other participant, for at least one evening, and impress each other.", availability_conditions="", points_rewarded=[1], repeatable=False, time_limit=None, min_participants_count=2, max_participants_count=2, leaderboard_ordering=None, contest_entry_type=None))

    challenges.append(Challenge(type=ChallengeType.Contest, challenge_uuid=0, game_uuid=game.game_uuid, name="Running (distance)", description="Run the furthest distance.", availability_conditions="", points_rewarded=[5,3,1,0,0,0,0,0], repeatable=False, time_limit=None, min_participants_count=2, max_participants_count=8, leaderboard_ordering="MAX(SUBMISSIONS) DESCENDING", contest_entry_type=ContestEntryType.Float))
    challenges.append(Challenge(type=ChallengeType.Contest, challenge_uuid=0, game_uuid=game.game_uuid, name="Running (speed)", description="Run the fastest over a distance of 3km.", availability_conditions="", points_rewarded=[5,3,1,0,0,0,0,0], repeatable=False, time_limit=None, min_participants_count=2, max_participants_count=8, leaderboard_ordering="MAX(SUBMISSIONS) DESCENDING", contest_entry_type=ContestEntryType.Float))
    challenges.append(Challenge(type=ChallengeType.Contest, challenge_uuid=0, game_uuid=game.game_uuid, name="Cycling (distance)", description="Bike the furthest distance.", availability_conditions="", points_rewarded=[5,3,1,0,0,0,0,0], repeatable=False, time_limit=None, min_participants_count=2, max_participants_count=8, leaderboard_ordering="MAX(SUBMISSIONS) DESCENDING", contest_entry_type=ContestEntryType.Float))
    challenges.append(Challenge(type=ChallengeType.Contest, challenge_uuid=0, game_uuid=game.game_uuid, name="Cycling (speed)", description="Bike the fastest over a distance of 10km.", availability_conditions="", points_rewarded=[5,3,1,0,0,0,0,0], repeatable=False, time_limit=None, min_participants_count=2, max_participants_count=8, leaderboard_ordering="MAX(SUBMISSIONS) DESCENDING", contest_entry_type=ContestEntryType.Float))
    challenges.append(Challenge(type=ChallengeType.Contest, challenge_uuid=0, game_uuid=game.game_uuid, name="Country swap", description="Take pictures of as many typically Finnish objects in Belgium or vice versa.", availability_conditions="", points_rewarded=[10,5,3,0,0,0,0,0], repeatable=False, time_limit=None, min_participants_count=2, max_participants_count=8, leaderboard_ordering="COUNT(SUBMISSIONS) DESCENDING", contest_entry_type=ContestEntryType.NONE))
    challenges.append(Challenge(type=ChallengeType.Contest, challenge_uuid=0, game_uuid=game.game_uuid, name="Dance battle", description="The name says it all. Upload a video of your best dance moves.", availability_conditions="", points_rewarded=[5,3,1,0,0,0,0,0], repeatable=False, time_limit=None, min_participants_count=2, max_participants_count=8, leaderboard_ordering="MANUAL", contest_entry_type=ContestEntryType.NONE))
    challenges.append(Challenge(type=ChallengeType.Contest, challenge_uuid=0, game_uuid=game.game_uuid, name="Car fanatic", description="Photograph the most yellow cars.", availability_conditions="", points_rewarded=[5,3,1,0,0,0,0,0], repeatable=False, time_limit=None, min_participants_count=2, max_participants_count=8, leaderboard_ordering="COUNT(SUBMISSIONS) DESCENDING", contest_entry_type=ContestEntryType.NONE))
    challenges.append(Challenge(type=ChallengeType.Contest, challenge_uuid=0, game_uuid=game.game_uuid, name="Far from home", description="Go the furthest from your dorm.", availability_conditions="", points_rewarded=[10,5,3,0,0,0,0,0], repeatable=False, time_limit=None, min_participants_count=2, max_participants_count=8, leaderboard_ordering="MAX(SUBMISSIONS) DESCENDING", contest_entry_type=ContestEntryType.Float))

    for challenge in challenges:
        add_supported_challenge(game.game_uuid, challenge)

    # my_uuid = add_user(new_user=User(user_uuid=0, auth0_subject_id="", is_global_admin=True, username="Storm", location="LEUVEN", game_uuids=set(), pfp_path=None), auth0_sub="google-oauth2|101099967266745560833")
    # add_game_participant(game_uuid=game.game_uuid, participant=GameParticipant(user_uuid=my_uuid, is_admin=True, challenge_instance_uuids=set()))
