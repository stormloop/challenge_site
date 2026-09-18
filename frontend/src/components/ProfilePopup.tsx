import styled, { useTheme } from 'styled-components'
import { NAVBAR_HEIGHT } from "../components/NavBar";
import { User } from '../data/User';
import { Game } from '../data/Game';
import type Participant from '../data/Participant';
import { useEffect, useState } from 'react';

import location_icon from '../assets/location_icon.svg?react'
import { useDataService } from '../services/DataService';
import Pfp from '../components/Pfp';
import { ChallengeInstanceStatus, type ChallengeInstance } from '../data/ChallengeInstance';
import OngoingChallengeInstance from './OngoingChallengeInstance';

const SeparatorStyledWrapper = styled.div`
    width: 100%;
    height: fit-content;
    display: flex;
    flex-direction: row;
    align-items: center;
    color: ${props => props.theme.text_color};
    font-family: ${props => props.theme.text_font_family};

    hr {
        max-width: 100%;
        flex: 1 1 0;
        height: 0px;
    }

    h1 {
        font-size: 20px;
    }
        `;

const Separator: React.FC<{ text: string }> = ({ text }) => {
    return (
        <SeparatorStyledWrapper>
            <hr />
            <h1>{text}</h1>
            <hr />
        </SeparatorStyledWrapper>
    )
};

const StyledWrapper = styled.div`
width: 100%;
height: calc(100% - ${NAVBAR_HEIGHT}px);
display: flex;
flex-direction: column;
align-items: center;
gap: 32px;
overflow: none;

font-family: ${props => props.theme.text_font_family};
color: ${props => props.theme.text_color};

padding: 64px 0px 0px 32px;
box-sizing: border-box;
overflow: auto;


.upper_bar {
    display: flex;
    flex-direction: row;
    gap: 24px;

    width: 100%;
}

.pfp_container {
    display: inline-block;
    width: 128px;
    height: 128px;
    position: relative;
}

.name_location_container {
    display: flex;
    flex-direction: column;

    width: fit-content;
    height: fit-content;
}

.name_container {
    display: flex;
    flex-direction: row;
    gap: 16px;
    margin: 0px;
    align-items: center;

    height: fit-content;
}

.name_container > * {
    font-size: 30px;
    align-content: center;
    margin-block-start: 0px;
    margin-block-end: 0px;
}

.name_input {
    font-size: 40px;
    width: calc(min(30%, 1000px));
}

.location_container {
    display: flex;
    flex-direction: row;
    gap: 16px;
    align-items: center;

    height: fit-content;
}

.location_container > * {
    font-size: 20px;
    align-content: center;
    margin-block-start: 0px;
    margin-block-end: 0px;
}


.icon {
    fill: #7d7171;
    width: 24px;
    height: 24px;

    position: relative;
    left: 10px;
}

.central_section {
    width: 100%;
    padding-right: 32px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    // overflow-y: auto;
    gap: 8px;
    padding-bottom: 16px;
}

// .central_section_div {
//     width: 100%;
//     padding-left: 32px;
//     box-sizing: border-box;
//     display: flex;
//     flex-direction: row;
//     justify-content: space-between;
// }

// .central_section h1 {
//     text-align: left;
//     font-weight: normal;
//     font-size: 20px;
//     width: 100%;
//     align-content: center;
//     margin-block-start: 16px;
//     margin-block-end: 0px;
// }

`;

export const ProfilePopup: React.FC<{ game: Game, user: User, participant: Participant, participants: { [key: string] : Participant}, adminEnabled: boolean }> = ({ game, user, participant, participants, adminEnabled }) => {
    const { getChallengeInstances } = useDataService();
    const theme = useTheme();
    let LocationIcon = location_icon;

    // All ongoing/finished challenges of the requested participant, visible to this participant.
    const [challengeInstances, setChallengeInstances] = useState<ChallengeInstance[]>([]);
    const onFirstRender = async () => {
        let challengeInstances: ChallengeInstance[];
        challengeInstances = await getChallengeInstances(game, participant, participants, adminEnabled);
        setChallengeInstances(challengeInstances);
    };
    useEffect(() => {
        onFirstRender();
    }, []);

    return (
        <StyledWrapper>
            <div className="upper_bar">
                <div className="pfp_container">
                    {
                        <Pfp background_color={theme.accent_color_5} pfp={participant.user.profile_picture} />
                    }
                </div>

                <div className="name_location_container">
                    <div className="name_container">
                        <p>{participant.user.username}</p>
                    </div>
                    <div className="location_container">
                        <LocationIcon className="icon" />
                        <p>{participant.user.location}</p>
                    </div>
                </div>
            </div>
            <div className="central_section">
                {
                    (adminEnabled || user.user_uuid == participant.user.user_uuid || challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.Ongoing).length > 0) &&
                    <Separator text="Ongoing Challenges" />
                }
                {(adminEnabled || user.user_uuid == participant.user.user_uuid) && challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.Ongoing).length == 0 ? <p className="central_message">{user.user_uuid == participant.user.user_uuid ? "You have no active challenges" : "This person has no active challenges."}</p> :
                    challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.Ongoing).map((value: ChallengeInstance, _: number) => {
                        return (
                            <OngoingChallengeInstance key={value.challenge_instance_uuid}
                                currentGame={game}
                                participant={participant}
                                adminEnabled={adminEnabled}     
                                participants={participants}
                                editable={false}
                                showLeaderboardPfp={false}
                                challengeInstance={value}
                                updateChallengeInstance={(_: ChallengeInstance) => {}}
                                leaveChallengeInstance={() => {}} />
                        )
                    })}
                {
                    (adminEnabled || user.user_uuid == participant.user.user_uuid || challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.UnderReview).length > 0) &&
                    <Separator text="Challenges Under Review" />
                }
                {(adminEnabled || user.user_uuid == participant.user.user_uuid) && challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.UnderReview).length == 0 ? <p className="central_message">{user.user_uuid == participant.user.user_uuid ? "You have no challenges under review" : "This person has no challenges under review."}</p> :
                    challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.UnderReview).map((value: ChallengeInstance, _: number) => {
                        return (
                            <OngoingChallengeInstance key={value.challenge_instance_uuid}
                                currentGame={game}
                                participant={participant}
                                adminEnabled={adminEnabled}     
                                participants={participants}
                                editable={false}
                                showLeaderboardPfp={false}
                                challengeInstance={value}
                                updateChallengeInstance={(_: ChallengeInstance) => {}}
                                leaveChallengeInstance={() => {}} />
                        )
                    })}
                <Separator text="Approved Challenges" />
                {challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.Approved).length == 0 ? <p className="central_message">{user.user_uuid == participant.user.user_uuid ? "You have not finished any challenges" : "This person has not finished any challenges."}</p> :
                    challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.Approved).map((value: ChallengeInstance, _: number) => {
                        return (
                            <OngoingChallengeInstance key={value.challenge_instance_uuid}
                                currentGame={game}
                                participant={participant}
                                adminEnabled={adminEnabled}     
                                participants={participants}
                                editable={false}
                                showLeaderboardPfp={false}
                                challengeInstance={value}
                                updateChallengeInstance={(_: ChallengeInstance) => {}}
                                leaveChallengeInstance={() => {}} />
                        )
                    })}
            </div>
        </StyledWrapper>
    )
}

export default ProfilePopup;