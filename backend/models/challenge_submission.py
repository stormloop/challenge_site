from pydantic import BaseModel
from fastapi import Form, UploadFile
from fastapi.responses import FileResponse

from datetime import datetime
from typing import Annotated, List

from utils.files import get_file_type

# A challenge instance is a challenge that is in progress.
# frontend to backend.
class ChallengeSubmissionUpload(BaseModel):
    challenge_submission_uuid: str  # Uuid of this submission.
    participant_uuid: str  # Uuid of the GameParticipant that submitted this.
    submitted_time: datetime  # Time of submission.
    description: str  # Extra info written by the submitter.
    data: List[UploadFile]  # Path to the image/video/link proving that (a part of) the challenge is completed.
    contest_entry: str | None = None


# backend to frontend.
class ChallengeSubmissionDownload(BaseModel):
    challenge_submission_uuid: str  # Uuid of this submission.
    participant_uuid: str  # Uuid of the GameParticipant that submitted this.
    submitted_time: datetime  # Time of submission, in utc timezone.
    description: str  # Extra info written by the submitter.
    filenames: List[str]  # data is shared independently.
    filetypes: List[str]  # data is shared independently.
    contest_entry: str | None


    def __hash__(self):
        return int(self.challenge_submission_uuid)

class ChallengeSubmission(BaseModel):
    challenge_submission_uuid: int  # Uuid of this submission.
    participant_uuid: int  # Uuid of the GameParticipant that submitted this.
    submitted_time: datetime  # Time of submission, in utc timezone.
    description: str  # Extra info written by the submitter.
    data: List[str]  # Path to the image/video/link proving that (a part of) the challenge is completed.
    contest_entry: str | None

    def to_endpoint_representation(self, get_submission_item_path) -> ChallengeSubmissionDownload:
        keys = self.model_dump()
        keys["challenge_submission_uuid"] = str(self.challenge_submission_uuid)
        keys["participant_uuid"] = str(self.participant_uuid)
        # keys.data = [FileResponse(get_submission_item_path(path)) for path in self.data]
        keys["filenames"] = keys.pop("data")
        keys["filetypes"] = [get_file_type(filename) for filename in keys["filenames"]]
        return ChallengeSubmissionDownload(**keys)

    @classmethod
    def from_endpoint_representation(cls, endpoint_representation: ChallengeSubmissionUpload, get_filename_function):
        keys = endpoint_representation.model_dump()
        keys["challenge_submission_uuid"] = int(endpoint_representation.challenge_submission_uuid)
        keys["participant_uuid"] = int(endpoint_representation.participant_uuid)
        # keys.data = [FileResponse(get_submission_item_path(path)) for path in self.data]
        keys["data"] = [get_filename_function(value) for value in keys.pop("data")]
        return ChallengeSubmission(**keys)

    def __hash__(self):
        return self.challenge_submission_uuid