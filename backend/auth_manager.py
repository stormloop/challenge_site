# This manager takes care of authentication and authorization.
# In order to see if a certain user has access to certain data, use this module.

import os

from dotenv import load_dotenv
from typing import Any

from fastapi import (
    Depends,
    HTTPException,
    status,
)
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
import jwt
from jwt import PyJWKClient
from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)

from models.game_participant import GameParticipant
from models.user import User
import database_manager as db

load_dotenv()


# class _Settings(BaseSettings):
#     auth0_domain: str
#     auth0_audience: str

#     auth0_auth_enabled: bool = False

#     model_config = SettingsConfigDict(
#         env_file=".env"
#     )

# _settings = _Settings()  # Gets data from the .env file.
_issuer = f"https://{os.environ["AUTH0_DOMAIN"]}/"  # used to check if JWT tokens come from the correct auth0 tenant.
_jwks_client = PyJWKClient(f"{_issuer}.well-known/jwks.json")  # To decode and validate incoming JWT tokens.
_bearer_scheme = HTTPBearer(auto_error=False)  # To extract data from the Bearer field in the HTTP headers, to securely verify user identity.


def get_current_claims(
    credentials:
        HTTPAuthorizationCredentials | None =
        Depends(_bearer_scheme),
) -> dict[str, Any]:
    """
    Gets all claims from the HTTP request header and returns them as a dictionary.
    """

    # Check if the client supplied credentials/a bearer field, 401 error code if not.
    if (
        credentials is None
        or credentials.scheme.lower() != "bearer"
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # Extract raw JWT Token.
    token = credentials.credentials

    try:
        signing_key = (
            _jwks_client
            .get_signing_key_from_jwt(token)
        )  # Get the public signing key from the JWT token.

        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=os.environ["AUTH0_AUDIENCE"],  # Check if the request is actually meant for this API.
            issuer=_issuer,  # Check if the issuer is the expected auth0 tenant.
            # Automatically also checks for expiration.
        )  # Validates (not just decodes) the JWT token.

        # Check if a 'sub' field was included in the JWT Token.
        # A 'sub' field is used to indicate the end-user doing the request.
        if "sub" not in claims:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has no subject",
            )
        return claims
    except jwt.PyJWTError:
        print(f"JWT validation failed: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )


def get_current_user(
    claims: dict = Depends(get_current_claims),
) -> User:
    """
    Checks if the end-user doing the request is a valid, authenticated user, and if so, returns their associated data.
    """
    auth0_sub_field = claims["sub"]

    for user in db.get_all_users().values():
        if user.auth0_subject_id == auth0_sub_field:
            return user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "Authenticated user is not registered in this application"
        ),
    )


def require_nonexisting_user(claims: dict[str, Any]) -> str:
    """
    Checks if the given claims correspond to a user that is not authenticated in the application yet.
    If so, it prints the subject field of their claims.
    """
    try:
        get_current_user(claims)
    except HTTPException:
        return claims["sub"]
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "Authenticated user is already registered in this application"
        ),
    )



def require_global_admin(
    user: User,
) -> User:
    """
    Returns the user profile if this is a global admin, otherwise, throws an error.
    """

    if not is_global_admin(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Global administrator "
                "permission required"
            ),
        )

    return user


def is_global_admin(user: User) -> bool:
    """
    Returns whether the user is a global admin.
    """
    return user.is_global_admin


def get_current_participant(game_uuid: int, user: User = Depends(get_current_user)) -> GameParticipant | None:
    """
    Returns the GameParticipant object corresponding with the person filing the HTTP request in the requested game.
    If the person is not a participant, returns None.
    """
    if not db.game_exists(game_uuid) and user.is_global_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot access data for this game (game does not exist)")
    if not db.game_exists(game_uuid) and not user.is_global_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Cannot access data for this game")

    if (db.participant_exists(game_uuid, user.user_uuid)):
         return db.get_game_participant(game_uuid, user.user_uuid)
    return None