import { styled, useTheme } from 'styled-components';

import type LeaderboardEntry from '../data/LeaderboardEntry';
import Pfp from './Pfp';

export const PODIUM_HEIGHT: number = 230; // Height of the entire LeaderboardPodium component. Not yet valid.
const PODIUM_COUNT: number = 3;
const PODIUM_HEIGHTS: number[] = [80, 60, 40];
const PODIUM_ORDER: number[] = [1, 0, 2]; // The person at index i in the leaderboards should get the PODIUM_ORDER[i]'th podium.

const PodiumStyle = styled.div`
// Podium
display: flex;
flex-direction: row;
gap: 10px;
position: relative;
top: 28px;

.podium_entry {
    display: flex;
    flex-direction: column;
    justify-content: end;
    color: ${props => props.theme.text_color};
    font-family: ${props => props.theme.text_font_family};
    font-weight: bold;
    align-items: center;
    gap: 5px;
}

.podium_entry p {
    margin-block-start: 0px;
    margin-block-end: 0px;
    cursor: pointer;
}

.large_pfp {
    fill: #303d46;
    width: 64px;
    height: 64px;
    cursor: pointer;
}

.points_container {
    padding: 2px 10px;
    border-radius: 50px;
    background-color: ${props => props.theme.accent_color_3};
    align-items: center;
    position: relative;
    top: -11px;
    z-index: 1;
    box-shadow: 0 4px 4px #404040;
}

.podium_svg {
    fill: #c7aa5b;
    width: 80px;
    position: relative;
    top: -28px;
    z-index: 0;
}

.highlighted_podium_svg {
    fill: ${props => props.theme.accent_color_1};
    width: 80px;
    position: relative;
    top: -28px;
    z-index: 0;
}

.svg_outer_shadow {
  /* -webkit-filter: drop-shadow( 3px 3px 2px rgba(0, 0, 0, .7)); */
  filter: drop-shadow( 0px 4px 4px rgba(0, 0, 0, .7));
  /* Similar syntax to box-shadow */
}
`;


export const LeaderboardPodium: React.FC<{ leaderboardEntries: LeaderboardEntry[], onClick: Function }> = ({ leaderboardEntries, onClick }) => {
    return (
        <PodiumStyle>
            {
                leaderboardEntries.length == 0 ? (<></>) :
                    leaderboardEntries.slice(0, PODIUM_COUNT) // Only take the podium places.
                        .map((value, index) => ({  // Add index information.
                            index: index, value: value
                        }))
                        .sort((a, b) => { // Sort them in the correct leaderboard order.
                            return PODIUM_ORDER[a.index] - PODIUM_ORDER[b.index];
                        })
                        .map((value, podium_index) => {  // Get HTML.
                            return <div key={podium_index} className="podium_entry">
                                <p onClick={() => onClick(value.index)}>{value.value.participant.user.username}</p>
                                <div className="large_pfp" onClick={() => onClick(value.index)}>
                                    <Pfp background_color={useTheme().accent_color_5} pfp={value.value.participant.user.profile_picture} />
                                </div>
                                <div className="points_container">
                                    <p>{value.value.points}</p>
                                </div>
                                <svg viewBox={"0 0 80 " + (PODIUM_HEIGHTS[PODIUM_ORDER[podium_index]] + 16).toString()} xmlns="http://www.w3.org/2000/svg" className={value.value.participant.user.is_me ? "highlighted_podium_svg" : "podium_svg"}>
                                    <defs id="defs1">
                                        <filter style={{ colorInterpolationFilters: 'sRGB' }} id="filter9" x="-0.13816487" y="-0.21711621" width="1.2763297" height="1.5548525">
                                            <feFlood result="flood" in="SourceGraphic" floodOpacity="0.498039" floodColor="rgb(0,0,0)" id="feFlood8" />
                                            <feGaussianBlur result="blur" in="SourceGraphic" stdDeviation="3.000000" id="feGaussianBlur8" />
                                            <feOffset result="offset" in="blur" dx="0.000000" dy="4.000000" id="feOffset8" />
                                            <feComposite result="comp1" operator="out" in="flood" in2="offset" id="feComposite8" />
                                            <feComposite result="comp2" operator="atop" in="comp1" in2="SourceGraphic" id="feComposite9" />
                                        </filter>
                                    </defs>
                                    <rect x="0" y="16" width="80" height={PODIUM_HEIGHTS[PODIUM_ORDER[podium_index]]} />
                                    <ellipse cx="40" cy="16" rx="45" ry="21" fill={useTheme().bg_color} />
                                    <ellipse style={{ filter: 'url(#filter9)' }} cx="40" cy="16" rx="40" ry="16" />
                                </svg>
                            </div>
                        })
            }
        </PodiumStyle >)
}

export default LeaderboardPodium;