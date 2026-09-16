import re
from collections.abc import Iterable
from typing import Any

# Written by ChatGPT.


# ---------------------------------------------------------------------------
# Location hierarchy
# ---------------------------------------------------------------------------

LOCATION_PARENTS: dict[str, set[str]] = {
    "LEUVEN": {"BELGIUM"},
    "JYVASKYLA": {"FINLAND"},
}


def location_matches(
    user_location: str,
    requested_location: str,
) -> bool:
    """
    Returns whether user_location is the requested location or is contained
    within it.

    Examples:
        LEUVEN    -> LEUVEN    = True
        LEUVEN    -> BELGIUM   = True
        BELGIUM   -> LEUVEN    = False
        JYVASKYLA -> FINLAND   = True
    """

    requested = requested_location.strip().upper()

    to_visit = [user_location.strip().upper()]
    visited: set[str] = set()

    while to_visit:
        current = to_visit.pop()

        if current in visited:
            continue

        visited.add(current)

        if current == requested:
            return True

        to_visit.extend(LOCATION_PARENTS.get(current, set()))

    return False


# ---------------------------------------------------------------------------
# Tokenizer
# ---------------------------------------------------------------------------

TOKEN_PATTERN = re.compile(
    r"""
    \s*
    (
        \(
        |
        \)
        |
        "(?:[^"\\]|\\.)*"
        |
        \bAND\b
        |
        \bOR\b
        |
        \bNOT\b
        |
        \bIS\b
        |
        [A-Za-z0-9_]+
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)


def tokenize(expression: str) -> list[str]:
    if not expression.strip():
        return []

    tokens: list[str] = []
    position = 0

    while position < len(expression):
        match = TOKEN_PATTERN.match(expression, position)

        if match is None:
            raise ValueError(
                f"Invalid availability condition near "
                f"{expression[position:]!r}"
            )

        tokens.append(match.group(1))
        position = match.end()

    return tokens


# ---------------------------------------------------------------------------
# Availability parser
# ---------------------------------------------------------------------------

class AvailabilityParser:
    """
    Recursive-descent parser/evaluator for availability conditions.

    Grammar:

        expression       := or_expression

        or_expression    := and_expression ("OR" and_expression)*

        and_expression   := not_expression ("AND" not_expression)*

        not_expression   := "NOT" not_expression
                           | primary

        primary          := "(" expression ")"
                           | atomic_condition

        atomic_condition := "LOCATION" "IS" location
                           | challenge_name "IS" "COMPLETED"
    """

    def __init__(
        self,
        tokens: list[str],
        user,
        participant,
        challenge_instances: Iterable[Any],
        challenges: Iterable[Any],
    ):
        self.tokens = tokens
        self.position = 0

        self.user = user
        self.participant = participant

        self.challenge_instances = list(challenge_instances)

        # Allows challenge names to be resolved to UUIDs.
        self.challenges_by_name = {
            challenge.name.upper(): challenge
            for challenge in challenges
        }

    # -----------------------------------------------------------------------
    # Token handling
    # -----------------------------------------------------------------------

    def current(self) -> str | None:
        if self.position >= len(self.tokens):
            return None

        return self.tokens[self.position]

    def consume(self, expected: str | None = None) -> str:
        token = self.current()

        if token is None:
            raise ValueError(
                "Unexpected end of availability condition"
            )

        if expected is not None and token.upper() != expected.upper():
            raise ValueError(
                f"Expected {expected!r}, got {token!r}"
            )

        self.position += 1
        return token

    # -----------------------------------------------------------------------
    # Parser
    # -----------------------------------------------------------------------

    def parse(self) -> bool:
        if not self.tokens:
            return True

        result = self.parse_or()

        if self.current() is not None:
            raise ValueError(
                f"Unexpected token {self.current()!r}"
            )

        return result

    def parse_or(self) -> bool:
        result = self.parse_and()

        while self.current() and self.current().upper() == "OR":
            self.consume("OR")

            # IMPORTANT:
            # Always parse the right-hand side.
            # Do not write:
            #
            #     result = result or self.parse_and()
            #
            # because Python would skip parse_and() when result is True.
            right = self.parse_and()

            result = result or right

        return result

    def parse_and(self) -> bool:
        result = self.parse_not()

        while self.current() and self.current().upper() == "AND":
            self.consume("AND")

            # IMPORTANT:
            # Always parse the right-hand side.
            # Do not write:
            #
            #     result = result and self.parse_not()
            #
            # because Python would skip parse_not() when result is False.
            right = self.parse_not()

            result = result and right

        return result

    def parse_not(self) -> bool:
        if self.current() and self.current().upper() == "NOT":
            self.consume("NOT")
            return not self.parse_not()

        return self.parse_primary()

    def parse_primary(self) -> bool:
        if self.current() == "(":
            self.consume("(")

            result = self.parse_or()

            self.consume(")")

            return result

        return self.parse_atomic_condition()

    # -----------------------------------------------------------------------
    # Conditions
    # -----------------------------------------------------------------------

    def parse_atomic_condition(self) -> bool:
        token = self.current()

        if token is None:
            raise ValueError("Expected availability condition")

        # ---------------------------------------------------------------
        # LOCATION IS "LEUVEN"
        # ---------------------------------------------------------------

        if token.upper() == "LOCATION":
            self.consume("LOCATION")
            self.consume("IS")

            location = self.unquote(self.consume())

            return location_matches(
                self.user.location,
                location,
            )

        # ---------------------------------------------------------------
        # "FINNISH 101" IS COMPLETED
        # ---------------------------------------------------------------

        challenge_name = self.unquote(self.consume())

        self.consume("IS")
        self.consume("COMPLETED")

        return self.challenge_is_completed(challenge_name)

    # -----------------------------------------------------------------------
    # Challenge instance lookup
    # -----------------------------------------------------------------------

    def challenge_is_completed(self, challenge_name: str) -> bool:
        """
        Returns True if this participant has an approved ChallengeInstance
        of the specified challenge.
        """

        challenge = self.challenges_by_name.get(
            challenge_name.upper()
        )

        if challenge is None:
            raise ValueError(
                f"Unknown challenge {challenge_name!r}"
            )

        for instance in self.challenge_instances:

            # Instance must belong to this game.
            if instance.game_uuid != challenge.game_uuid:
                continue

            # Instance must be an instance of the requested challenge.
            if instance.challenge_uuid != challenge.challenge_uuid:
                continue

            # Participant must have participated in this instance.
            if self.participant.user_uuid not in instance.participant_uuids:
                continue

            # Only approved instances count as completed.
            if int(instance.status) != 3:
                continue

            return True

        return False

    @staticmethod
    def unquote(value: str) -> str:
        if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
            return value[1:-1]

        return value


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def is_challenge_available(
    user,
    participant,
    challenge,
    game,
    challenge_instances: Iterable[Any],
    challenges: Iterable[Any],
) -> bool:
    """
    Determine whether `challenge` is currently available to `participant`.

    `challenge_instances` should contain the ChallengeInstances that have
    been started by this participant.

    `challenges` should contain the Challenges available in the game, so that
    conditions such as `"FINNISH 101" IS COMPLETED` can resolve the name.
    """

    # -----------------------------------------------------------------------
    # Validate relationships
    # -----------------------------------------------------------------------

    if user.user_uuid != participant.user_uuid:
        return False

    if challenge.game_uuid != game.game_uuid:
        return False

    if user.user_uuid not in game.participant_uuids:
        return False

    if challenge.challenge_uuid not in game.supported_challenge_uuids:
        return False

    # -----------------------------------------------------------------------
    # Empty condition = always available
    # -----------------------------------------------------------------------

    expression = challenge.availability_conditions.strip()

    if not expression:
        return True

    # -----------------------------------------------------------------------
    # Evaluate expression
    # -----------------------------------------------------------------------

    parser = AvailabilityParser(
        tokens=tokenize(expression),
        user=user,
        participant=participant,
        challenge_instances=challenge_instances,
        challenges=challenges,
    )

    return parser.parse()