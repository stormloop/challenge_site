import React, { useContext, useEffect, useRef, useState, type ChangeEvent, type ChangeEventHandler } from 'react'
import { styled, useTheme } from 'styled-components';

import { Challenge as ChallengeObject, ChallengeType, ContestEntryType } from '../data/Challenge'
import Button from './Button';
import type { Game } from '../data/Game';
import { ChallengeInstance as ChallengeInstanceObject, ChallengeInstanceStatus, StatusToString } from '../data/ChallengeInstance';
import type Participant from '../data/Participant';
import type { Auth0ContextInterface, User } from '@auth0/auth0-react';
import { ChallengeSubmission } from '../data/ChallengeSubmission';
import { ChallengeSubmission as ChallengeSubmissionDisplay } from './ChallengeSubmission';
import { useDataService } from '../services/DataService';
import { removeFromArray } from '../utils/utils';
import LeaderboardEntry from '../data/LeaderboardEntry';
import NewSubmissionPopup from './NewSubmissionPopup';
import { PopupContext } from '../context/PopupContext';
import { dateComparer } from '../utils/comparers';
import Leaderboard from './Leaderboard';


const StyledWrapper = styled.div`
color: ${props => props.theme.text_color};
font-family: ${props => props.theme.text_font_family};
display: flex;
flex-direction: column;
gap: 0px;
width: 100%;

.header {
    background-color: #435a4d;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding: 8px 16px 8px 16px;
    border-radius: 16px 16px 0px 0px;
    box-shadow: 0 4px 4px #1a2a20;
    box-sizing: border-box;
    z-index: 1;
    
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

.tab_bar {
    background-color: #395042;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
}

.tab_bar > button {
    background: none;
    border-left: 1px solid white;
    border-right: transparent;
    border-top: transparent;
    border-bottom: 1px solid white;
    color: ${props => props.theme.text_color};
    flex: 1 1 0;
    padding: 8px 0 8px 0;
}

.tab_bar > .first_tab {
    border-left: transparent;
}

.tab_bar > .highlighted {
    background-color: #2f4036;
    border-bottom: transparent;
}

.body {
    background-color: #2f4036;
    border-radius: 0px 0px 16px 16px;
    padding: 24px;
}

.body h1 {
    font-size: 17px;
    font-weight: bold;
    text-decoration: underline;
}

.specification {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding: 0 0 0 0;
}

.specification p {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding-left: 16px;

    margin-block-start: 8px;
    margin-block-end: 8px;
}

.body > p {
    padding-left: 16px;
}

.button_area {
    display: flex;
    flex-direction: row;
    gap: 8px;

    justify-content: right;
}

.submissions_body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
}

.leaderboard_body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}
`;

export const OngoingChallengeInstance: React.FC<{ auth0interface: Auth0ContextInterface<User>, currentGame: Game, participant: Participant, participants: { [key: string]: Participant }, challengeInstance: ChallengeInstanceObject, updateChallengeInstance: Function, leaveChallengeInstance: Function }> = ({ auth0interface, currentGame, participant, participants, challengeInstance, updateChallengeInstance, leaveChallengeInstance }) => {
    const { getChallengeSubmissions, updateChallengeInstance: updateChallengeInstanceBackend, leaveChallengeInstance: leaveChallengeInstanceBackend, addChallengeSubmission, getChallengeInstance } = useDataService();
    const { closePopup, openPopup, refreshPopup } = useContext(PopupContext);
    const theme = useTheme();

    const tabs: string[] = ["Challenge", "Submissions"]
    if (challengeInstance.challenge.type == ChallengeType.Contest)
        tabs.push("Leaderboard");

    const [collapsed, setCollapsed] = useState<boolean>(true);
    const [tab, setTab] = useState<number>(0);
    const [submissions, setSubmissions] = useState<ChallengeSubmission[]>([]);

    const loadSubmissions = async () => {
        const submissions: ChallengeSubmission[] = await getChallengeSubmissions(currentGame, challengeInstance);
        setSubmissions(submissions);
    }

    useEffect(() => {
        if (collapsed)
            return;
        if (submissions.length > 0)
            return;
        loadSubmissions();
    }, [collapsed])

    const Header = (
        <div className={"header" + (collapsed ? " collapsed" : "")} onClick={() => setCollapsed(!collapsed)}>
            <p>{challengeInstance.challenge.get_name()}</p>
            <p>
                {challengeInstance.overwrite_points != null ?
                    (
                        challengeInstance.overwrite_points.length > 1 ?
                            `${challengeInstance.overwrite_points[challengeInstance.overwrite_points.length - 1]} to ${challengeInstance.overwrite_points[0]}`
                            : challengeInstance.overwrite_points[0]
                    )
                    : (challengeInstance.challenge.get_points_rewarded().length > 1 ?
                        `${challengeInstance.challenge.get_points_rewarded()[challengeInstance.challenge.get_points_rewarded().length - 1]} to ${challengeInstance.challenge.get_points_rewarded()[0]}`
                        : challengeInstance.challenge.get_points_rewarded()[0])}
            </p>
        </div>
    );

    const TabBar = (
        <div className="tab_bar">
            {
                tabs.map((value, index) => {
                    return (
                        <button key={index} className={(index == 0 ? "first_tab" : "") + (index == tab ? " highlighted" : "")} onClick={() => setTab(index)}>{value}</button>
                    );
                })
            }
        </div>
    );

    const leaveChallengeInstancePopup = () => {
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

        openPopup({
            header: "Are you sure?",
            getBody: () => {
                return (
                    <StyledWrapper>
                        <p>You are attempting to leave '{challengeInstance.challenge.name}'</p>
                        <div>
                            <Button color={theme.accent_color_5} text="Leave" icon={null} disabled={false} onClick={() => {
                                if (currentGame == null)
                                    throw new Error("Tried to leave game 'null'");
                                leaveChallengeInstance();
                                leaveChallengeInstanceBackend(currentGame, challengeInstance, participant, false);
                                closePopup();
                            }} />
                            <Button color={theme.accent_color_3} text="Cancel" icon={null} disabled={false} onClick={closePopup} />
                        </div>
                    </StyledWrapper>
                );
            },

            onAbort: closePopup
        });
    }

    const changeStatus = () => {
        if (challengeInstance.status == ChallengeInstanceStatus.Ongoing) {
            const updatedChallengeInstance: ChallengeInstanceObject = Object.assign(new ChallengeInstanceObject(), challengeInstance);
            updatedChallengeInstance.status = ChallengeInstanceStatus.UnderReview;
            updateChallengeInstance(updatedChallengeInstance);
            updateChallengeInstanceBackend(currentGame, updatedChallengeInstance, false);
            return;
        }

        if (challengeInstance.status == ChallengeInstanceStatus.UnderReview) {
            const updatedChallengeInstance: ChallengeInstanceObject = Object.assign(new ChallengeInstanceObject(), challengeInstance);
            updatedChallengeInstance.status = ChallengeInstanceStatus.Ongoing;
            updateChallengeInstance(updatedChallengeInstance);
            updateChallengeInstanceBackend(currentGame, updatedChallengeInstance, false);
            return;
        }
    }

    const ChallengeTab = (
        <div className="body">
            <h1>Participants</h1>
            <ul>
                {
                    [...challengeInstance.participant_uuids].map((value: string, index: number) =>
                        <li key={index}>{participants[value].user.username}</li>
                    )
                }
            </ul>
            <h1>Specifications</h1>
            {
                challengeInstance.challenge.get_specifications().concat(challengeInstance.get_specifications()).map((value, index) => {
                    return (
                        <div key={index} className="specification">
                            <p>{value[0]}</p>
                            <p>{value[2]}</p>
                        </div>
                    );
                })
            }
            <h1>Description</h1>
            <p>{challengeInstance.challenge.description}</p>
            {
                challengeInstance.challenge.type == ChallengeType.Contest ?
                    (
                        <div className="button_area">
                            <Button text="Leave" icon={null} disabled={false} onClick={leaveChallengeInstancePopup} color={theme.accent_color_5} />
                        </div>
                    )
                    :
                    (
                        <div className="button_area">
                            <Button text="Leave" icon={null} disabled={false} onClick={leaveChallengeInstancePopup} color={theme.accent_color_5} />
                            {!challengeInstance.IsShownInFinishedSubTab() && <Button text={challengeInstance.status == ChallengeInstanceStatus.Ongoing ? "Finish" : "Continue"} icon={null} disabled={!(challengeInstance.status == ChallengeInstanceStatus.Ongoing || challengeInstance.status == ChallengeInstanceStatus.UnderReview)} onClick={changeStatus} color={theme.accent_color_2} />}
                        </div>
                    )
            }
        </div>
    );

    const openNewSubmissionPopup = () => {
        openPopup({
            header: "New Submission",
            getBody: () => (<NewSubmissionPopup
                auth0interface={auth0interface}
                currentGame={currentGame}
                participant={participant}
                allParticipants={participants}
                challengeInstance={challengeInstance}
                updateChallengeInstance={updateChallengeInstance}
                leaveChallengeInstance={leaveChallengeInstance}
                submissions={submissions}
                setSubmissions={setSubmissions} />),
            onAbort: () => closePopup(1)
        });
    }

    /**
     * Removes a challenge submission.
     * Does not update the backend.
     */
    async function removeSubmission(submission: ChallengeSubmission) {
        const copyArray: ChallengeSubmission[] = submissions.concat([]);
        setSubmissions(removeFromArray(copyArray, submission));
        challengeInstance.challenge_submission_uuids?.delete(submission.challenge_submission_uuid);
        console.warn("unsafe call here? not sure if editing challengeInstance like this is a good habit... we do however want to avoid refetching data");

        // If this is a contest, reload to reload the leaderboard.
        if (challengeInstance.challenge.type == ChallengeType.Contest) {
            updateChallengeInstance(await getChallengeInstance(currentGame, challengeInstance.challenge_instance_uuid, participants));
        }
    }

    const SubmissionsTab = (
        <div className="body submissions_body">
            {/* New submission button */}
            {challengeInstance.status == ChallengeInstanceStatus.Ongoing && <Button text="New Submission" icon={null} disabled={false} onClick={openNewSubmissionPopup} color={theme.accent_color_1} />}
            {/* current submissions */}
            {
                submissions.length == 0 ?
                    <p>There are no submissions yet.</p>
                    : submissions.sort((a, b) => dateComparer(a.submitted_time, b.submitted_time)).map((value, index) =>
                        <ChallengeSubmissionDisplay key={index}
                            auth0interface={auth0interface}
                            currentGame={currentGame}
                            participant={participant}
                            submittor={participants[value.participant_uuid]}
                            challengeInstance={challengeInstance}
                            challengeSubmission={value}
                            removeChallengeSubmission={() => removeSubmission(value)} />)
            }
        </div>
    );

    const LeaderboardTab = (
        <div className="body leaderboard_body">
            {challengeInstance.challenge.type == ChallengeType.Contest && <Leaderboard onClick={() => { }} leaderboardEntries={challengeInstance.leaderboard.map((value, index) =>
                Object.assign(new LeaderboardEntry(), { participant: value.participant, points: challengeInstance.getPointsForContest(index) })
            )} />}
        </div>
    );

    if (collapsed)
        return (<StyledWrapper>
            {Header}
        </StyledWrapper>);

    return (<StyledWrapper>
        {Header}
        {TabBar}
        {[ChallengeTab, SubmissionsTab, LeaderboardTab][tab]}
    </StyledWrapper>);
}

export default OngoingChallengeInstance;
