import styled, { useTheme } from "styled-components";
import type Participant from "../data/Participant";
import { NAVBAR_HEIGHT } from "./NavBar";
import { PODIUM_HEIGHT } from "./LeaderboardPodium";
import type LeaderboardEntry from "../data/LeaderboardEntry";
import Pfp from "./Pfp";

const LeaderboardStyle = styled.div`
display: flex;
flex-direction: column;
gap: 0px;
width: 90%;
flex 1 1 0;
overflow: auto;
color: ${props => props.theme.text_color};
font-family: ${props => props.theme.text_font_family};
align-items: center;

.leaderboard_entry {
    display: flex;
    flex-direction: row;
    height: 56px;
    width: 90%;
    gap: 32px;
    padding-left: 16px;
    padding-right: 31px;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    cursor: pointer;
}

.first {
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
}

.last {
    border-bottom-left-radius: 16px 16px;
    border-bottom-right-radius: 16px 16px;
}

.even {
    background-color: ${props => props.theme.leaderboard_color_1};
}
.odd {
    background-color: ${props => props.theme.leaderboard_color_2};
}
.highlighted {
    background-color: ${props => props.theme.accent_color_1};
    width: 92%;
    padding-left: calc(1% + 16px);
    padding-right: calc(1% + 31px);
}

.leaderboard_entry div {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 16px;
}

.leaderboard_position {
    border-radius: 50px;
    background-color: ${props => props.theme.leaderboard_color_3};;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    font-weight: bold;
    text-align: center;
}

.small_pfp {
    fill: ${props => props.theme.accent_color_5};
    width: 48px;
    height: 48px;
}
`;


export const Leaderboard: React.FC<{ leaderboardEntries: LeaderboardEntry[], onClick: Function }> = ({ leaderboardEntries, onClick }) => {
    return (
        <LeaderboardStyle>
            {
                leaderboardEntries.length == 0 ? (<></>) : leaderboardEntries.map((value, index) => {
                    return <div key={index} className={"leaderboard_entry "
                        + (value.participant.user.is_me ? "highlighted" : (index % 2 == 0 ? "even" : "odd"))
                        + (index == 0 ? " first" : "") + (index == leaderboardEntries.length - 1 ? " last" : "")}
                        onClick={() => { onClick(index) }}>
                        <div>
                            { /* left aligned */}
                            <div className="leaderboard_position">
                                <p>{index + 1}</p>
                            </div>
                            <div className="small_pfp">
                                <Pfp background_color={useTheme().accent_color_5} pfp={value.participant.user.profile_picture} />
                            </div>
                            <p>{value.participant.user.username}</p>
                        </div>
                        { /* right aligned */}
                        <div className="leaderboard_points_total">
                            <p>{value.points}</p>
                        </div>
                    </div>
                })
            }
        </LeaderboardStyle>)
}

export default Leaderboard;