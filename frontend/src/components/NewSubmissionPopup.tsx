import type { Auth0ContextInterface, User } from "@auth0/auth0-react";
import styled, { useTheme } from "styled-components";
import type { Game } from "../data/Game";
import { useContext, useState, type ChangeEvent } from "react";
import { ChallengeType, ContestEntryType } from "../data/Challenge";
import { ChallengeSubmission } from "../data/ChallengeSubmission";
import type Participant from "../data/Participant";
import Button from "./Button";
import type { ChallengeInstance } from "../data/ChallengeInstance";
import { useDataService } from "../services/DataService";
import { PopupContext } from "../context/PopupContext";


const StyledWrapper = styled.div`
width: 100%;
display: flex;
flex-direction: column;
align-items: center;
overflow: auto;
padding-bottom: 16px;

.align_right {
    display: flex;
    flex-direction: row;
    align-items: right;
}

p {
    text-decoration: underline;
}

img {
    max-width: 100%;
    max-height: 256px;
    width: auto;
    height: auto;
}
video {
    max-width: 100%;
    max-height: 256px;
    width: auto;
    height: auto;
}
    
.media_item {
    max-width: 80%;
    max-height: 256px;
    position: relative;
    padding-bottom: 8px;
}

.media_item_close_button {
    background-color: ${props => props.theme.accent_color_5};
    border: none;
    border-radius: 100px;
    width: 24px;
    height: 24px;
    position: absolute;
    top: 0px;
    right: 0px;
    box-shadow: 0 4px 4px ${props => props.theme.bg_color};
}

.file_input {
    background-color: ${props => props.theme.bg_color_darkened};
    width: 32px;
    height: 32px;
    min-width: 32px;
    min-height: 32px;
    border-radius: 16px;
    border: none;
    margin: 5px;
    color: ${props => props.theme.text_color};
    cursor: pointer;
}

.contest_input {
    background-color: ${props => props.theme.bg_color_darkened};
    height: 2em;
    width: 
    min-width: 32px;
    border-radius: 16px;
    padding-left: 16px;
    padding-right: 16px;
    border: none;
    margin: 5px;
    color: ${props => props.theme.text_color};
    cursor: pointer;
}

textarea {
    background-color: ${props => props.theme.bg_color_darkened};
    border-radius: 16px;
    border: none;
    padding-left: 16px;
    padding-right: 16px;
    margin: 5px;
    color: ${props => props.theme.text_color};
    width: 80%;
    min-height: 10em;
    margin-bottom: 16px;
}
    `;

export const NewSubmissionPopup: React.FC<{ auth0interface: Auth0ContextInterface<User>, currentGame: Game, participant: Participant, adminEnabled: boolean, allParticipants: { [key: string]: Participant }, challengeInstance: ChallengeInstance, updateChallengeInstance: Function, leaveChallengeInstance: Function, submissions: ChallengeSubmission[], setSubmissions: Function }> = ({ currentGame, participant, adminEnabled, allParticipants, challengeInstance, updateChallengeInstance, submissions, setSubmissions }) => {
    const { addChallengeSubmission, getChallengeInstance } = useDataService();
    const { closePopup, openPopup, refreshPopup } = useContext(PopupContext);
    const theme = useTheme();

    const [newSubmission, setNewSubmission] = useState<ChallengeSubmission>(new ChallengeSubmission());

    const removeFile = (index: number) => {
        const submissionCopy = Object.assign(new ChallengeSubmission(), newSubmission);
        submissionCopy.files.splice(index, 1);
        setNewSubmission(submissionCopy);
        refreshPopup();
    }

    const submitNewFiles = (e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
        if (e.target.files == null)
            return;
        const submissionCopy = Object.assign(new ChallengeSubmission(), newSubmission);
        submissionCopy.files = submissionCopy.files.concat([...e.target.files]);
        e.target.value = ""; // Reset file input so the same file can be selected again, if needed.
        setNewSubmission(submissionCopy);
        refreshPopup();
    }

    const changeContestEntry = (e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
        const submissionCopy = Object.assign(new ChallengeSubmission(), newSubmission);
        submissionCopy.contest_entry = e.target.value;
        setNewSubmission(submissionCopy);
        refreshPopup();
    }

    const changeDescription = (e: ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>) => {
        const submissionCopy = Object.assign(new ChallengeSubmission(), newSubmission);
        submissionCopy.description = e.target.value;
        setNewSubmission(submissionCopy);
        refreshPopup();
    }

    const canSubmit = () => {
        if (newSubmission.files.length == 0)
            return false;
        if (newSubmission.description.trim() == "")
            return false;
        if (challengeInstance.challenge.type == ChallengeType.Contest)
            if (challengeInstance.challenge.contest_entry_type != ContestEntryType.None)
                return newSubmission.contest_entry != "" && newSubmission.contest_entry != null;
        return true;
    }

    const submitPopup = () => {

        const StyledWrapper = styled.div`
                display: flex;
                flex-direction: column;
                justify-content: space-between;

                div {
                    display: flex;
                    flex-direction: row;
                    justify-content: space-between;
                }
            `;

        /**
         * Submits a new submission to this challenge instance.
         */
        async function submitEntry() {
            // Submit request.
            const copy: ChallengeSubmission = Object.assign(new ChallengeSubmission(), newSubmission);
            copy.challenge_submission_uuid = "0";
            copy.participant_uuid = participant.user.user_uuid;
            copy.submitted_time = new Date().toISOString();
            // The backend also adds necessary data, like a valid uuid and a verified timestamp.
            const completeSubmission: ChallengeSubmission = await addChallengeSubmission(currentGame, challengeInstance, copy, adminEnabled);
            // Add to the submissions.
            setSubmissions([...submissions.concat([completeSubmission])]);
            // Clear the new submission fields.
            setNewSubmission(new ChallengeSubmission());

            // If this is a contest, reload to reload the leaderboard.
            if (challengeInstance.challenge.type == ChallengeType.Contest) {
                const updatedChallengeInstance = await getChallengeInstance(currentGame, challengeInstance.challenge_instance_uuid, allParticipants);
                updateChallengeInstance(updatedChallengeInstance);
            }
        }


        openPopup({
            header: "Are you sure?",
            getBody: () => (
                <StyledWrapper>
                    <p>You are about to submit.</p>
                    <div>
                        <Button color={theme.accent_color_5} text="Submit" icon={null} disabled={false} onClick={() => {
                            if (!canSubmit()) {
                                closePopup();
                                throw new Error("Cannot submit");
                            }
                            submitEntry();
                            closePopup(1);
                        }} />
                        <Button color={theme.accent_color_3} text="Cancel" icon={null} disabled={false} onClick={closePopup} />
                    </div>
                </StyledWrapper>
            ),

            onAbort: closePopup
        });
    }

    return (
        <StyledWrapper>
            <p>Files</p>
            {
                newSubmission.files.map((value, index) => {
                    const type = value.type.split('/')[0]
                    if (type == "image")
                        return (
                            <div key={index} className="media_item">
                                <img key={index} id={value.name} src={URL.createObjectURL(value)} alt={"image to submit"} />
                                <button className="media_item_close_button" onClick={() => removeFile(index)}>x</button>
                            </div>);
                    if (type == "video")
                        return (
                            <div key={index} className="media_item">
                                <video controls key={index}>
                                    <source src={URL.createObjectURL(value)} id={value.name} />
                                </video>
                                <button className="media_item_close_button" onClick={() => removeFile(index)}>x</button>
                            </div>
                        );
                    return <h3>unsupported file type: {type}</h3>
                })
            }
            <input id="file_input" hidden={true} type="file" accept="image/*,video/*" multiple={true} onChange={submitNewFiles} />
            <button className="file_input" onClick={() => document.getElementById("file_input")?.click()} >+</button>
            {
                challengeInstance.challenge.type == ChallengeType.Contest && challengeInstance.challenge.contest_entry_type != ContestEntryType.None
                && (<p>Contest Entry</p>)}
            {
                challengeInstance.challenge.type == ChallengeType.Contest && challengeInstance.challenge.contest_entry_type != ContestEntryType.None
                && (<input className="contest_input" type="number" step={challengeInstance.challenge.contest_entry_type == ContestEntryType.Integer ? "1" : "any"} onChange={changeContestEntry} />)}
            <p>Description</p>
            <textarea className="description_input" rows={5} cols={1} onChange={changeDescription} />
            <Button text="Submit" icon={null} disabled={!canSubmit()} color={theme.accent_color_1} onClick={submitPopup} />
        </StyledWrapper>
    );
}

export default NewSubmissionPopup;