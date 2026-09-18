from json import JSONDecodeError

from fastapi import Depends, HTTPException, Request

from auth_manager import get_current_participant, get_current_user, is_global_admin
from models.game_participant import GameParticipant
from models.user import User


def has_admin_permissions(user: User = Depends(get_current_user), participant: GameParticipant = Depends(get_current_participant)):
    if is_global_admin(user):
        return True
    if (participant is not None and participant.is_admin):
        return True
    return False


def has_admin_enabled(admin_mode: bool, user: User = Depends(get_current_user), participant: GameParticipant = Depends(get_current_participant)):
    return has_admin_permissions(user, participant) and admin_mode


async def get_body(request: Request):
    """
    Parses a request body and returns the result, no matter if the body was encoded in JSON or FormData.
    """
    content_type = request.headers.get('Content-Type')
    if content_type is None:
        raise HTTPException(status_code=400, detail='No Content-Type provided!')
    elif content_type == 'application/json':
        try:
            return await request.json()
        except JSONDecodeError:
            raise HTTPException(status_code=400, detail='Invalid JSON data')
    elif (content_type == 'application/x-www-form-urlencoded' or
          content_type.startswith('multipart/form-data')):
        try:
            return await request.form()
        except Exception:
            raise HTTPException(status_code=400, detail='Invalid Form data')
    else:
        raise HTTPException(status_code=400, detail='Content-Type not supported!')