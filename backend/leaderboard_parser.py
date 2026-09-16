import re
from collections.abc import Iterable
from datetime import datetime
from typing import Any

# Written by ChatGPT.

# ---------------------------------------------------------------------------
# Tokenizer
# ---------------------------------------------------------------------------

LEADERBOARD_TOKEN_PATTERN = re.compile(
    r"""
    \s*
    (
        \(
        |
        \)
        |
        \bMAX\b
        |
        \bMIN\b
        |
        \bCOUNT\b
        |
        \bFIRST\b
        |
        \bLAST\b
        |
        \bSUBMISSIONS\b
        |
        \bASCENDING\b
        |
        \bDESCENDING\b
        |
        \bMANUAL\b
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)


def tokenize_leaderboard_ordering(expression: str) -> list[str]:
    if not expression.strip():
        return []

    tokens: list[str] = []
    position = 0

    while position < len(expression):
        match = LEADERBOARD_TOKEN_PATTERN.match(expression, position)

        if match is None:
            raise ValueError(
                f"Invalid leaderboard ordering near "
                f"{expression[position:]!r}"
            )

        tokens.append(match.group(1))
        position = match.end()

    return tokens


# ---------------------------------------------------------------------------
# Leaderboard parser
# ---------------------------------------------------------------------------

class LeaderboardOrderingParser:
    """
    Parser/evaluator for contest leaderboard ordering.

    Supported expressions:

        MAX(SUBMISSIONS) DESCENDING
        MAX(SUBMISSIONS) ASCENDING

        MIN(SUBMISSIONS) DESCENDING
        MIN(SUBMISSIONS) ASCENDING

        COUNT(SUBMISSIONS) DESCENDING
        COUNT(SUBMISSIONS) ASCENDING

        FIRST(SUBMISSIONS) DESCENDING
        FIRST(SUBMISSIONS) ASCENDING

        LAST(SUBMISSIONS) DESCENDING
        LAST(SUBMISSIONS) ASCENDING

        MANUAL
    """

    AGGREGATIONS = {
        "MAX",
        "MIN",
        "COUNT",
        "FIRST",
        "LAST",
    }

    DIRECTIONS = {
        "ASCENDING",
        "DESCENDING",
    }

    def __init__(
        self,
        tokens: list[str],
        participants: Iterable[Any],
        challenge_instance: Any,
        challenge: Any,
        challenge_submissions: Iterable[Any],
    ):
        self.tokens = tokens
        self.position = 0

        self.participants = list(participants)
        self.challenge_instance = challenge_instance
        self.challenge = challenge
        self.challenge_submissions = list(challenge_submissions)

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
                "Unexpected end of leaderboard ordering"
            )

        if (
            expected is not None
            and token.upper() != expected.upper()
        ):
            raise ValueError(
                f"Expected {expected!r}, got {token!r}"
            )

        self.position += 1
        return token

    # -----------------------------------------------------------------------
    # Parser
    # -----------------------------------------------------------------------

    def parse(self) -> list[int]:
        if not self.tokens:
            return self.manual_order()

        if self.current().upper() == "MANUAL":
            self.consume("MANUAL")

            if self.current() is not None:
                raise ValueError(
                    f"Unexpected token {self.current()!r}"
                )

            return self.manual_order()

        aggregation = self.consume().upper()

        if aggregation not in self.AGGREGATIONS:
            raise ValueError(
                f"Unknown leaderboard aggregation {aggregation!r}"
            )

        self.consume("(")
        self.consume("SUBMISSIONS")
        self.consume(")")

        direction = self.consume().upper()

        if direction not in self.DIRECTIONS:
            raise ValueError(
                f"Unknown leaderboard direction {direction!r}"
            )

        if self.current() is not None:
            raise ValueError(
                f"Unexpected token {self.current()!r}"
            )

        return self.order_participants(
            aggregation,
            direction,
        )

    # -----------------------------------------------------------------------
    # Ordering
    # -----------------------------------------------------------------------

    def order_participants(
        self,
        aggregation: str,
        direction: str,
    ) -> list[int]:
        participant_ids = [
            participant.user_uuid
            for participant in self.participants
            if participant.user_uuid
            in self.challenge_instance.participant_uuids
        ]

        submissions_by_participant: dict[int, list[Any]] = {
            participant_uuid: []
            for participant_uuid in participant_ids
        }

        for submission in self.challenge_submissions:
            if submission.participant_uuid not in submissions_by_participant:
                continue

            submissions_by_participant[
                submission.participant_uuid
            ].append(submission)

        ranking_values: dict[int, Any] = {
            participant_uuid: self.calculate_value(
                submissions,
                aggregation,
            )
            for participant_uuid, submissions
            in submissions_by_participant.items()
        }

        return self.sort_participants(
            participant_ids,
            ranking_values,
            aggregation,
            direction,
        )

    # -----------------------------------------------------------------------
    # Aggregation
    # -----------------------------------------------------------------------

    def calculate_value(
        self,
        submissions: list[Any],
        aggregation: str,
    ) -> Any:

        # ---------------------------------------------------------------
        # COUNT
        #
        # contest_entry is irrelevant.
        # Every submission counts.
        # ---------------------------------------------------------------

        if aggregation == "COUNT":
            return len(submissions)

        # ---------------------------------------------------------------
        # FIRST
        #
        # contest_entry is irrelevant.
        # Find the earliest submission time.
        # ---------------------------------------------------------------

        if aggregation == "FIRST":
            if not submissions:
                return None

            return min(
                submission.submitted_time
                for submission in submissions
            )

        # ---------------------------------------------------------------
        # LAST
        #
        # contest_entry is irrelevant.
        # Find the latest submission time.
        # ---------------------------------------------------------------

        if aggregation == "LAST":
            if not submissions:
                return None

            return max(
                submission.submitted_time
                for submission in submissions
            )

        # ---------------------------------------------------------------
        # MIN / MAX
        #
        # Only submissions with a contest_entry participate.
        # ---------------------------------------------------------------

        valid_entries = [
            self.numeric_contest_entry(submission)
            for submission in submissions
            if submission.contest_entry is not None
        ]

        if not valid_entries:
            return None

        if aggregation == "MAX":
            return max(valid_entries)

        if aggregation == "MIN":
            return min(valid_entries)

        raise ValueError(
            f"Unsupported leaderboard aggregation {aggregation!r}"
        )

    # -----------------------------------------------------------------------
    # Sorting
    # -----------------------------------------------------------------------

    @staticmethod
    def sort_participants(
        participant_ids: list[int],
        ranking_values: dict[int, Any],
        aggregation: str,
        direction: str,
    ) -> list[int]:
        """
        Sort participants according to the aggregation.

        Participants without a usable ranking value are always placed last.

        FIRST:
            DESCENDING = earliest first
            ASCENDING  = latest first

        LAST:
            DESCENDING = latest first
            ASCENDING  = earliest first

        COUNT / MIN / MAX:
            DESCENDING = highest value first
            ASCENDING  = lowest value first
        """

        ranked = [
            participant_uuid
            for participant_uuid in participant_ids
            if ranking_values[participant_uuid] is not None
        ]

        unranked = [
            participant_uuid
            for participant_uuid in participant_ids
            if ranking_values[participant_uuid] is None
        ]

        if aggregation == "FIRST":
            # Earlier timestamp = better ranking.
            reverse = direction == "ASCENDING"

        elif aggregation == "LAST":
            # Later timestamp = better ranking.
            reverse = direction == "DESCENDING"

        else:
            reverse = direction == "DESCENDING"

        ranked.sort(
            key=lambda participant_uuid:
                ranking_values[participant_uuid],
            reverse=reverse,
        )

        return ranked + unranked

    # -----------------------------------------------------------------------
    # Contest entry conversion
    # -----------------------------------------------------------------------

    @staticmethod
    def numeric_contest_entry(submission: Any) -> int | float:
        value = submission.contest_entry

        if isinstance(value, bool):
            raise ValueError(
                f"Invalid contest_entry {value!r}: "
                "booleans are not numeric"
            )

        if isinstance(value, (int, float)):
            return value

        try:
            return float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Invalid contest_entry {value!r}: expected a number"
            ) from exc

    # -----------------------------------------------------------------------
    # Manual ordering
    # -----------------------------------------------------------------------

    def manual_order(self) -> list[int]:
        """
        Preserve the current leaderboard order.

        Participants in the challenge instance but absent from the existing
        leaderboard are appended afterwards.
        """

        participant_ids = {
            participant.user_uuid
            for participant in self.participants
            if participant.user_uuid
            in self.challenge_instance.participant_uuids
        }

        ordered: list[int] = []
        seen: set[int] = set()

        for participant_uuid, _ in (
            self.challenge_instance.leaderboard or []
        ):
            if participant_uuid in participant_ids:
                ordered.append(participant_uuid)
                seen.add(participant_uuid)

        for participant_uuid in participant_ids:
            if participant_uuid not in seen:
                ordered.append(participant_uuid)

        return ordered
    

def order_challenge_leaderboard(
    participants: Iterable[Any],
    challenge_instance: Any,
    challenge: Any,
    challenge_submissions: Iterable[Any],
) -> list[int]:
    """
    Calculate the leaderboard ordering for a ChallengeInstance.

    Returns participant UUIDs in leaderboard order.
    """

    if challenge_instance.overwrite_leaderboard_to_manual:
        tokens = ["MANUAL"]

    else:
        expression = (challenge.leaderboard_ordering or "").strip()

        if not expression:
            tokens = ["MANUAL"]
        else:
            tokens = tokenize_leaderboard_ordering(expression)

    parser = LeaderboardOrderingParser(
        tokens=tokens,
        participants=participants,
        challenge_instance=challenge_instance,
        challenge=challenge,
        challenge_submissions=challenge_submissions,
    )

    return parser.parse()