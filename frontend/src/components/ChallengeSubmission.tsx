import React, { useContext, useEffect, useRef, useState } from 'react'
import { styled, useTheme } from 'styled-components';

import image_not_found from '../assets/image_not_found.svg'
import { Challenge as ChallengeObject, ChallengeType } from '../data/Challenge'
import Button from './Button';
import type { Game } from '../data/Game';
import { ChallengeInstance as ChallengeInstanceObject, ChallengeInstanceStatus, StatusToString } from '../data/ChallengeInstance';
import type Participant from '../data/Participant';
import type { Auth0ContextInterface, User } from '@auth0/auth0-react';
import { ChallengeSubmission as ChallengeSubmissionObject } from '../data/ChallengeSubmission';
import { useDataService } from '../services/DataService';
import Pfp from './Pfp';
import { print_date } from '../utils/pretty_print';
import { PopupContext } from '../context/PopupContext';

const StyledWrapper = styled.div`
width: 100%;


.submission_header {
    background-color: #1e3026;
    display: flex;
    flex-direction: row;
    justify-content: left;
    gap: 8px;
    padding: 8px 16px 8px 16px;
    border-radius: 16px 16px 0px 0px;
    box-shadow: 0 4px 4px #1a2a20;
    box-sizing: border-box;
    z-index: 1;

    width: 100%;
    
    font-size: 17px;
    font-weight: bold;

    cursor: pointer;
}

.header > * {
    font-family: ${props => props.theme.text_color};
}

.collapsed {
    border-radius: 16px 16px 16px 16px;
}

.header_pfp {
    width: 32px;
    height: auto;
}

.header_text {
    display: flex;
    flex-direction: column;
}

.header_text > h1 {
    font-size: 15px;
    font-weight: bold;
    text-decoration: none;
    margin-block-start: 0px;
    margin-block-end: 0px;
}

.header_text > h2 {
    font-size: 10px;
    margin-block-start: 0px;
    margin-block-end: 0px;
}

.submission_body {
    background-color: #18201c;
    border-radius: 0px 0px 16px 16px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.media_item {
    width: 100%;
    height: fit-contents;
    display: flex;
    flex-direction: row;
    justify-content: space-around;

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

.right_aligned {
    display: flex;
    flex-direction: row;
    justify-content: right;
    width: 100%;
}

.horizontal_layout {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    width: 100%;
}
`;

export const ChallengeSubmission: React.FC<{ auth0interface: Auth0ContextInterface<User>, currentGame: Game, participant: Participant, challengeInstance: ChallengeInstanceObject, challengeSubmission: ChallengeSubmissionObject, submittor: Participant, removeChallengeSubmission: Function }> = ({ auth0interface, currentGame, participant, challengeInstance, challengeSubmission, submittor, removeChallengeSubmission }) => {
    const { getSubmissionFiles, removeChallengeSubmission: removeChallengeSubmissionBackend } = useDataService();
    const { closePopup, openPopup } = useContext(PopupContext);
    const theme = useTheme();

    const [collapsed, setCollapsed] = useState<boolean>(true);
    const [files, setFiles] = useState<File[]>([]);

    const onFirstRender = async () => {
        // Try to get the files from the server, if they are not loaded yet.
        const files = (await getSubmissionFiles(currentGame, challengeInstance, challengeSubmission)).files;
        challengeSubmission.files = files;
        console.warn("modifying upper layer state variable.");
        if (files.length > 0)
            setFiles(files);
    };
    useEffect(() => {
        onFirstRender();
    }, []);


    function updateFilePreviews() {
        function updateFilePreview(index: number) {
            const file = files[index];
            var mixedfile = file['type'].split("/");
            var filetype = mixedfile[0]; // (image, video)
            if (filetype == "image") {
                const htmlElement = document.getElementById(`file_${challengeSubmission.challenge_submission_uuid}_${index}`);
                if (htmlElement == null || !(htmlElement instanceof HTMLImageElement))
                    return;
                const fileTarget = htmlElement as HTMLImageElement;
                fileTarget.src = URL.createObjectURL(file);
                return;
            } else if (filetype == "video") {
                const htmlElement = document.getElementById(`file_${challengeSubmission.challenge_submission_uuid}_${index}`);
                if (htmlElement == null || !(htmlElement instanceof HTMLSourceElement))
                    return;
                const fileTarget = htmlElement as HTMLSourceElement;
                fileTarget.src = URL.createObjectURL(file);
                (fileTarget.parentElement as HTMLVideoElement).load();
            } else {
                console.error("Invalid file type " + file['type']);
            }
        }

        for (var i = 0; i < files.length; i++) {
            updateFilePreview(i);
        }
    }
    useEffect(() => {
        updateFilePreviews();
    }, [files, collapsed]);


    /**
     * Removes this challenge instance submission.
     */
    function remove(): void {
        removeChallengeSubmissionBackend(currentGame, challengeInstance, challengeSubmission, false);
        removeChallengeSubmission();
    }

    /**
     * Downloads one of the challenge submission files to the local device.
     */
    function downloadFile(f: File) {
        throw new Error("not implemented");
    }

    function openDeletePopup(): void {
        openPopup({
            header: "Are you sure?",
            getBody: () => {
                return (
                    <StyledWrapper>
                        <p>You are about to delete a submission.</p>
                        <div>
                            <Button color={theme.accent_color_5} text="Leave" icon={null} disabled={false} onClick={() => {
                                remove()
                                closePopup();
                            }} />
                            <Button color={theme.accent_color_3} text="Cancel" icon={null} disabled={false} onClick={closePopup} />
                        </div>
                    </StyledWrapper>
                );
            },

            onAbort: closePopup
        })
    }

    return (
        <StyledWrapper>
            <div className={collapsed ? "submission_header collapsed" : "submission_header"} onClick={() => setCollapsed(!collapsed)}>
                <div className="header_pfp">
                    <Pfp background_color={useTheme().accent_color_5} pfp={submittor.user.profile_picture} />
                </div>
                <div className="header_text">
                    <h1>{submittor.user.username}</h1>
                    <h2>{print_date(challengeSubmission.submitted_time)}</h2>
                </div>
            </div>
            {
                !collapsed && (
                    <div className="submission_body">
                        <div className="horizontal_layout">
                            <h1>Contest Entry</h1>
                            <p>{challengeSubmission.contest_entry}</p>
                        </div>
                        <h1>Description</h1>
                        <p>{challengeSubmission.description}</p>
                        <h1>Files</h1>
                        {
                            challengeSubmission.filenames.length == 0 ? <></> :
                                challengeSubmission.filenames.map((_: string, index: number) => (
                                    challengeSubmission.filetypes[index] == "image" ?
                                        <div key={index} className="media_item">
                                            <img id={`file_${challengeSubmission.challenge_submission_uuid}_${index}`} src={image_not_found} alt={"image not found"} />
                                        </div> :
                                        challengeSubmission.filetypes[index] == "video" ?
                                            <div key={index} className="media_item">
                                                <video controls key={index}>
                                                    <source src={undefined} id={`file_${challengeSubmission.challenge_submission_uuid}_${index}`} />
                                                </video>
                                            </div> :
                                            <div key={index} className="media_item">
                                                <h3>Unsupported file type.</h3>
                                            </div>
                                ))
                        }
                        {challengeInstance.status == ChallengeInstanceStatus.Ongoing && <div className="right_aligned"><Button text="Delete" icon={null} color={theme.accent_color_5} disabled={false} onClick={openDeletePopup} /></div>}
                    </div>

                )
            }
        </StyledWrapper >)
}

export default ChallengeSubmission;
