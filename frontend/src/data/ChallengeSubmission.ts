export class ChallengeSubmission {
    challenge_submission_uuid: string = "_INVALID_UUID_";
    participant_uuid: string = "_INVALID_UUID_";
    submitted_time: string = "";
    description: string = "";
    files: File[] = [];
    filenames: string[] = [];
    filetypes: string[] = [];
    contest_entry: string | null = null;

    public ToUploadRepresentation() : FormData {
        const form = new FormData();
        form.append("challenge_submission_uuid", this.challenge_submission_uuid);
        form.append("participant_uuid", this.participant_uuid);
        form.append("submitted_time", this.submitted_time);
        form.append("description", this.description);
        if (this.contest_entry != null)
            form.append("contest_entry", this.contest_entry);
        for (var i = 0; i < this.files.length; i++)
            form.append("data", this.files[i]);
        return form;
    }
}