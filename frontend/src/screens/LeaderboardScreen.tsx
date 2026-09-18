import styled from 'styled-components'
import Leaderboard from '../components/Leaderboard.tsx';
import LeaderboardPodium from '../components/LeaderboardPodium.tsx';
import { NAVBAR_HEIGHT } from "../components/NavBar";
import type LeaderboardEntry from '../data/LeaderboardEntry.ts';
import type Participant from '../data/Participant.ts';
import ProfilePopup from '../components/ProfilePopup.tsx';
import { useContext } from 'react';
import { PopupContext } from '../context/PopupContext.tsx';
import type { Game } from '../data/Game.ts';
import type { User } from '../data/User.ts';

const TOP_PADDING: number = 100;
const BOTTOM_PADDING: number = 0;

const StyledWrapper = styled.div`
width: 100%;
height: calc(100% - ${NAVBAR_HEIGHT + TOP_PADDING + BOTTOM_PADDING}px);
position: absolute;
left: 0px;
top: 0px;
display: flex;
flex-direction: column;
align-items: center;
background-color: ${props => props.theme.bg_color};
padding-top: ${TOP_PADDING}px;
padding-bottom: ${BOTTOM_PADDING}px;
    `;

export const LeaderboardScreen: React.FC<{ leaderboardEntries: LeaderboardEntry[], game: Game, user: User, adminEnabled: boolean}> = ({ leaderboardEntries, game, user, adminEnabled }) => {
    const { closePopup, openPopup } = useContext(PopupContext);

    function openParticipantPopup(participant: Participant) {
        const participants: {[key: string] : Participant} = {};
        for (var i = 0; i < leaderboardEntries.length; i++)
            participants[leaderboardEntries[i].participant.user.user_uuid] = leaderboardEntries[i].participant;

        openPopup({
                    header: participant.user.username,
                    getBody: () => {
                        return (
                            <ProfilePopup game={game} user={user} participant={participant} participants={participants} adminEnabled={adminEnabled} />
                        );
                    },
        
                    onAbort: closePopup
        });
    }

    return (
        <StyledWrapper>
            <LeaderboardPodium leaderboardEntries={leaderboardEntries} onClick={(index: number) => openParticipantPopup(leaderboardEntries[index].participant)} />
            <Leaderboard leaderboardEntries={leaderboardEntries} onClick={(participant: Participant) => openParticipantPopup(participant)} showPfp={true} />
        </StyledWrapper>)
}

export default LeaderboardScreen;