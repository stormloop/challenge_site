import React, { useContext, useState } from 'react'
import { styled, useTheme } from 'styled-components';

import { Challenge as ChallengeObject, ChallengeType } from '../data/Challenge'
import Button from './Button';
import type { Game } from '../data/Game';
import { ChallengeInstance, ChallengeInstanceStatus } from '../data/ChallengeInstance';
import type Participant from '../data/Participant';
import type { Auth0ContextInterface, User } from '@auth0/auth0-react';
import { useDataService } from '../services/DataService';
import { PopupContext } from '../context/PopupContext';

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

.body p {
    padding-left: 16px;
}

.buttonsArea {
    display: flex;
    flex-direction: row;

    justify-content: right;
    gap: 8px;
}
`;

/*
 * A NavBar is used to navigate between multiple tabs of an application.
 * It is often found at an edge of the page.
 * This implementation allows the designer to define a set of tabs, each with icon and text.
 * The NavBar can then be implemented in the page by usign GetHtml()
 */
export const Challenge: React.FC<{ auth0interface: Auth0ContextInterface<User>, currentGame: Game, participant: Participant, allParticipants: { [key: string]: Participant }, challenge: ChallengeObject, challengeInstances: ChallengeInstance[], addChallengeInstance: Function }> = ({ auth0interface, currentGame, participant, allParticipants, challenge, challengeInstances, addChallengeInstance }) => {
    const { addChallengeInstance: addChallengeInstanceBackend, getJoinableChallengeInstances, joinChallengeInstance: JoinChallengeInstanceBackend } = useDataService();
    const { closePopup, openPopup } = useContext(PopupContext);
    const theme = useTheme();

    const [collapsed, setCollapsed] = useState(true);


    /**
     * Starts a new Challenge Instance, where only the current user is a participant.
     */
    async function startChallenge() {
        let challengeInstance = new ChallengeInstance();
        challengeInstance.challenge_instance_uuid = "0"; // Overwritten by backend.
        challengeInstance.challenge = challenge;
        challengeInstance.challenge_submission_uuids = null;
        challengeInstance.complete_time = null;
        challengeInstance.start_time = new Date().toISOString();
        challengeInstance.overwrite_points = null;
        challengeInstance.participant_uuids = new Set();
        challengeInstance.participant_uuids.add(participant.user.user_uuid);
        challengeInstance.status = ChallengeInstanceStatus.Ongoing;
        challengeInstance.overwrite_leaderboard_to_manual = false;
        challengeInstance.leaderboard = [];

        challengeInstance = await addChallengeInstanceBackend(currentGame, challengeInstance, false);
        addChallengeInstance(challengeInstance);
        participant.challenge_instance_uuids.add(challengeInstance.challenge_instance_uuid);
        console.warn("modifying upper layer state variable: participant");
    }

    /**
     * Opens a popup to allow the user to select joinable challenge instances.
     */
    async function joinExistingChallengePopup() {
        const StyledWrapper = styled.div`
        color: ${props => props.theme.text_color};
        font-family: ${props => props.theme.text_font_family};
        display: flex;
        flex-direction: column;
        // align-items: center;
        gap: 8px;
        width: 100%;

        .body {
            background-color: ${props => props.theme.accent_color_3};
            border-radius: 16px 16px 16px 16px;
            padding: 0px 16px 16px 0px;
        }

        .body h1 {
            padding-left: 16px;
            font-size: 17px;
            font-weight: bold;
            text-decoration: underline;
        }

        .button_area {
            display: flex;
            flex-direction: row;

            justify-content: right;
            gap: 8px;
        }
            `;

        const joinableInstances: ChallengeInstance[] = await getJoinableChallengeInstances(currentGame, challenge, allParticipants);


        const joinChallengeInstance = async (instance: ChallengeInstance) => {
            await JoinChallengeInstanceBackend(currentGame, instance, participant, false);
            addChallengeInstance(instance);
            participant.challenge_instance_uuids.add(instance.challenge_instance_uuid);
            closePopup();
        }

        openPopup({
            header: "Select existing challenge",
            getBody: () => {
                return (
                    <StyledWrapper>
                        {
                            joinableInstances.map((value: ChallengeInstance, _: number) => (
                                <div className="body">
                                    <h1>Participants:</h1>
                                    <ul>
                                        {
                                            [...value.participant_uuids].map((participant_uuid: string, index: number) => (
                                                <li key={index}>
                                                    {allParticipants[participant_uuid].user.username}
                                                </li>
                                            ))
                                        }
                                    </ul>
                                    <div className="button_area">
                                        <Button color={theme.accent_color_2} text="Join" icon={null} disabled={false} onClick={() => joinChallengeInstance(value)} />
                                    </div>
                                </div>
                            ))
                        }
                    </StyledWrapper>
                )


                return joinableInstances.map((value: ChallengeInstance, _: number) => (
                    <div>
                        <h1>Instance</h1>
                        {
                            [...value.participant_uuids].map((participant_uuid: string, _: number) =>
                                allParticipants[participant_uuid].user.username
                            )
                        }
                        <button onClick={() => joinChallengeInstance(value)}>Join</button>
                    </div>
                ));
            },

            onAbort: closePopup
        });
    }

    return (
        <StyledWrapper>
            <div className={"header" + (collapsed ? " collapsed" : "")} onClick={() => setCollapsed(!collapsed)}>
                <p>{challenge.get_name()}</p>
                <p>{challenge.get_points_rewarded().length > 1 ?
                    `${challenge.get_points_rewarded()[challenge.get_points_rewarded().length - 1]} to ${challenge.get_points_rewarded()[0]}`
                    : challenge.get_points_rewarded()[0]}</p>
            </div>
            {collapsed ? <></> :
                <div className="body">
                    <h1>Specifications</h1>
                    {
                        challenge.get_specifications().map((value, index) => {
                            return (
                                <div key={index} className="specification">
                                    <p>{value[0]}</p>
                                    <p>{value[2]}</p>
                                </div>
                            );
                        })
                    }
                    <h1>Description</h1>
                    <p>{challenge.description}</p>
                    {
                        challenge.get_challenge_type() == ChallengeType.Solo ?
                            <div className="buttonsArea">
                                <Button text="Start" icon={null} color={theme.accent_color_2} onClick={startChallenge} disabled={false} />
                            </div>
                            : <div className="buttonsArea">
                                <Button disabled={!challenge.is_joinable(challengeInstances)} text="Join Existing" icon={null} color={theme.accent_color_2} onClick={joinExistingChallengePopup} />
                                <Button disabled={!challenge.is_startable(challengeInstances)} text="Start New" icon={null} color={theme.accent_color_2} onClick={startChallenge} />
                            </div>
                    }
                </div>
            }
        </StyledWrapper>)
}

export default Challenge;
