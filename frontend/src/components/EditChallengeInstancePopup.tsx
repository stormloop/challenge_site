import type { Auth0ContextInterface, User } from "@auth0/auth0-react";
import styled, { useTheme } from "styled-components";
import type { Game } from "../data/Game";
import { useContext, useState, type ChangeEvent } from "react";
import { ChallengeType } from "../data/Challenge";
import type Participant from "../data/Participant";
import Button from "./Button";
import { ChallengeInstance, ChallengeInstanceStatus, StatusToString } from "../data/ChallengeInstance";
import { useDataService } from "../services/DataService";
import { PopupContext } from "../context/PopupContext";
import LeaderboardEntry from "../data/LeaderboardEntry";


const StyledWrapper = styled.div`
width: 100%;
display: flex;
flex-direction: column;
align-items: center;
overflow: auto;
padding-bottom: 16px;
overflow: auto;

.align_right {
    display: flex;
    flex-direction: row;
    align-items: right;
}

.participant_entry {
    width: 80%;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding: 8px 16px 8px 16px;
    align-items: center;
}
.first {
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
}
.last {
    border-bottom-left-radius: 16px;
    border-bottom-right-radius: 16px;
}
.highlighted {
    background-color: ${props => props.theme.accent_color_1};
}
.even {
    background-color: ${props => props.theme.bg_color_darkened};
}
.odd {
    background-color: ${props => props.theme.bg_color};
}

.horizontal_align {
    display: flex;
    flex-direction: row;
    width: 80%;
    justify-content: center;
    gap: 16px;
    align-items: center;
}

.horizontal_align_wide {
    display: flex;
    flex-direction: row;
    width: 80%;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
}

h1 {
    font-size: 20px;
    text-decoration: underline;
}
input {
    border-radius: 16px;
    border: none;
    padding: 16px;
    margin: 5px;
    color: ${props => props.theme.text_color};
}
select {
    background-color: ${props => props.theme.bg_color_darkened};
    border-radius: 16px;
    border: none;
    padding: 16px;
    margin: 5px;
    color: ${props => props.theme.text_color};
}
    `;

export const EditChallengeInstancePopup: React.FC<{ currentGame: Game, participant: Participant, allParticipants: { [key: string]: Participant }, challengeInstance: ChallengeInstance, updateChallengeInstance: Function, leaveChallengeInstance: Function }> = ({ currentGame, participant, allParticipants, challengeInstance, updateChallengeInstance }) => {
    const { updateChallengeInstance: updateChallengeInstanceBackend } = useDataService();
    const { closePopup, openPopup } = useContext(PopupContext);
    const theme = useTheme();

    let challengeInstanceCopy = Object.assign(new ChallengeInstance(), challengeInstance);
    challengeInstanceCopy.participant_uuids = new Set<string>([...challengeInstance.participant_uuids]);
    challengeInstanceCopy.leaderboard = [...challengeInstance.leaderboard];
    const [updatedInstance, setUpdatedChallengeInstance] = useState<ChallengeInstance>(challengeInstanceCopy);


    const savePopup = () => {
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
        async function update() {
            updateChallengeInstanceBackend(currentGame, updatedInstance, true);
            updateChallengeInstance(updatedInstance);
            closePopup(1);
        }


        openPopup({
            header: "Are you sure?",
            getBody: () => (
                <StyledWrapper>
                    <p>You are about to update a challenge instance.</p>
                    <div>
                        <Button color={theme.accent_color_5} text="Save" icon={null} disabled={false} onClick={update} />
                        <Button color={theme.accent_color_3} text="Cancel" icon={null} disabled={false} onClick={closePopup} />
                    </div>
                </StyledWrapper>
            ),

            onAbort: closePopup
        });
    }

    return (
        <StyledWrapper>
            <h1>Participants</h1>
            {
                [...updatedInstance.participant_uuids].map((value, index) => {
                                            return (
                                                <div key={index} className={"participant_entry" 
                                                                    + (index == 0 ? " first" : "") 
                                                                    + (index == ([...updatedInstance.participant_uuids].length ?? 1) - 1 ? " last" : "") 
                                                                    + (value == participant.user.user_uuid ? " highlighted" 
                                                                            : (index % 2 == 0 ? " even" : " odd"))}>
                                                    <p>{allParticipants[value].user.username}</p>
                                                    <Button text="Remove" icon={null} disabled={[...updatedInstance.participant_uuids].length == 1} color={theme.accent_color_5} onClick={() => {
                                                        const instanceCopy = Object.assign(new ChallengeInstance(), updatedInstance);
                                                        instanceCopy.participant_uuids.delete(value);
                                                        setUpdatedChallengeInstance(instanceCopy);
                                                    }} />
                                                </div>
                                            );
                                        })
            }
            { [...Object.keys(allParticipants)].filter((value, _) => !updatedInstance.participant_uuids.has(value)).length > 0 &&
            <div className="horizontal_align">
                <select id="participant_add_dropdown" defaultValue={[...Object.keys(allParticipants)].filter((value, _) => !updatedInstance.participant_uuids.has(value))[0]}>
                    {
                        [...Object.keys(allParticipants)].filter((value, _) => !updatedInstance.participant_uuids.has(value)).map((value, _) => {
                            return (
                                <option value={value}>{allParticipants[value].user.username}</option>
                            )
                        })
                    }
                </select>
                <Button text="+" icon={null} disabled={false} color={theme.accent_color_3} onClick={() => {
                    const instanceCopy = Object.assign(new ChallengeInstance(), updatedInstance);
                    instanceCopy.participant_uuids.add((document.getElementById("participant_add_dropdown") as HTMLSelectElement).value);
                    setUpdatedChallengeInstance(instanceCopy);
                }} />
            </div>
            }
            <h1>Status</h1>
            <select id="status_dropdown" defaultValue={updatedInstance.status} onChange={(e: ChangeEvent<HTMLSelectElement, HTMLSelectElement>) => {
                    const instanceCopy = Object.assign(new ChallengeInstance(), updatedInstance);
                    instanceCopy.status = [ChallengeInstanceStatus.Ongoing, ChallengeInstanceStatus.UnderReview, ChallengeInstanceStatus.Approved][e.target.value as unknown as number];
                    setUpdatedChallengeInstance(instanceCopy);
            }}>
                {
                    [ChallengeInstanceStatus.Ongoing, ChallengeInstanceStatus.UnderReview, ChallengeInstanceStatus.Approved].map((value, index) => {
                        return (
                            <option value={index}>{StatusToString(value)}</option>
                        )
                    })
                }
            </select>
            <h1>Points</h1>
            <div className="horizontal_align">
                <p>Overwrite Points</p>
                <input type="checkbox" defaultChecked={updatedInstance.overwrite_points != null} onChange={(e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
                    const instanceCopy = Object.assign(new ChallengeInstance(), updatedInstance);
                    if (e.target.checked) {
                        if (challengeInstance.overwrite_points != null)
                            instanceCopy.overwrite_points = [...challengeInstance.overwrite_points];
                        else
                            instanceCopy.overwrite_points = [...challengeInstance.challenge.points_rewarded];
                    }
                    else
                        instanceCopy.overwrite_points = null;
                    setUpdatedChallengeInstance(instanceCopy);
                }} />
            </div>
            {
                updatedInstance.overwrite_points != null &&
                updatedInstance.overwrite_points.map((value, index) => {
                    return <div key={index} className={"participant_entry" 
                                                                    + (index == 0 ? " first" : "") 
                                                                    + (index == (updatedInstance.overwrite_points?.length ?? 1) - 1 ? " last" : "") 
                                                                    + (index % 2 == 0 ? " even" : " odd")}>
                        <p>Position {index+1}</p>
                        <input className={index % 2 == 0 ? "odd" : "even"} type="number" step={1} defaultValue={value} onChange={(e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
                            const instanceCopy = Object.assign(new ChallengeInstance(), updatedInstance);
                            if (instanceCopy.overwrite_points == null)
                                return;
                            instanceCopy.overwrite_points[index] = (e.target.value as unknown as number);
                            setUpdatedChallengeInstance(instanceCopy);
                        }} />
                    </div>
                })
            }
            { updatedInstance.challenge.type == ChallengeType.Contest &&
                <h1>Leaderboard</h1>
            }
            { updatedInstance.challenge.type == ChallengeType.Contest &&
            <div className="horizontal_align_wide">
                <p>Overwrite Leaderboard</p>
                <input type="checkbox" defaultChecked={updatedInstance.overwrite_leaderboard_to_manual} onChange={(e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
                    const instanceCopy = Object.assign(new ChallengeInstance(), updatedInstance);
                    instanceCopy.overwrite_leaderboard_to_manual = e.target.checked;
                    setUpdatedChallengeInstance(instanceCopy);
                }} />
            </div>
            }
            { updatedInstance.challenge.type == ChallengeType.Contest &&
                updatedInstance.overwrite_leaderboard_to_manual &&
                updatedInstance.leaderboard.map((value, index) => {
                    return <div key={index} className={"participant_entry" 
                                                                    + (index == 0 ? " first" : "") 
                                                                    + (index == updatedInstance.leaderboard.length - 1 ? " last" : "") 
                                                                    + (value.participant.user.user_uuid == participant.user.user_uuid ? " highlighted" 
                                                                            : (index % 2 == 0 ? " even" : " odd"))}>
                        <p>Position {index+1}</p>
                        <select defaultValue={value.participant.user.user_uuid} onChange={(e: ChangeEvent<HTMLSelectElement, HTMLSelectElement>) => {
                            const instanceCopy = Object.assign(new ChallengeInstance(), updatedInstance);
                            instanceCopy.leaderboard[index] = Object.assign(new LeaderboardEntry(), {participant: allParticipants[e.target.value], points: 0});
                            setUpdatedChallengeInstance(instanceCopy);
                        }}>
                            {
                                [...new Set<string>([...updatedInstance.participant_uuids, ...updatedInstance.leaderboard.map((value, _) => value.participant.user.user_uuid)])].map((value, _) => {
                                    return (
                                        <option value={value}>{allParticipants[value].user.username}</option>
                                    )
                                })
                            }
                        </select>
                        <Button text="-" icon={null} disabled={false} color={theme.accent_color_5} onClick={() => {
                            const instanceCopy = Object.assign(new ChallengeInstance(), updatedInstance);
                            instanceCopy.leaderboard.splice(index, 1);
                            setUpdatedChallengeInstance(instanceCopy);
                        }} />
                    </div>
                })
            }
            { updatedInstance.challenge.type == ChallengeType.Contest &&
                [...updatedInstance.participant_uuids].filter((value, _) => updatedInstance.leaderboard.filter((value2, _) => value == value2.participant.user.user_uuid).length == 0).length > 0 &&
                <div className="horizontal_align">
                    <select id="participant_add_to_leaderboard_dropdown" defaultValue={[...updatedInstance.participant_uuids].filter((value, _) => updatedInstance.leaderboard.filter((value2, _) => value == value2.participant.user.user_uuid).length == 0)[0]}>
                        {
                            [...updatedInstance.participant_uuids].filter((value, _) => updatedInstance.leaderboard.filter((value2, _) => value == value2.participant.user.user_uuid).length == 0).map((value, _) =>  {
                                return (
                                    <option value={value}>{allParticipants[value].user.username}</option>
                                )
                            })
                        }
                    </select>
                    <Button text="+" icon={null} disabled={false} color={theme.accent_color_3} onClick={() => {
                        const instanceCopy = Object.assign(new ChallengeInstance(), updatedInstance);
                        instanceCopy.leaderboard.push(Object.assign(new LeaderboardEntry(), {participant: allParticipants[(document.getElementById("participant_add_to_leaderboard_dropdown") as HTMLSelectElement).value], points: 0}));
                        setUpdatedChallengeInstance(instanceCopy);
                    }} />
                </div>
            }

            <div className="center_align">
                <Button text="Save" icon={null} disabled={false} color={theme.accent_color_5} onClick={savePopup} />
            </div>
        </StyledWrapper>
    );
}

export default EditChallengeInstancePopup;