import styled from 'styled-components'
import Leaderboard from '../components/Leaderboard.tsx';
import LeaderboardPodium from '../components/LeaderboardPodium.tsx';
import { NAVBAR_HEIGHT } from "../components/NavBar";
import type LeaderboardEntry from '../data/LeaderboardEntry.ts';

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

export const LeaderboardScreen: React.FC<{ leaderboardEntries: LeaderboardEntry[] }> = ({ leaderboardEntries }) => {
    return (
        <StyledWrapper>
            <LeaderboardPodium leaderboardEntries={leaderboardEntries} onClick={(_: number) => { }} />
            <Leaderboard leaderboardEntries={leaderboardEntries} onClick={(_: number) => { }} />
        </StyledWrapper>)
}

export default LeaderboardScreen;