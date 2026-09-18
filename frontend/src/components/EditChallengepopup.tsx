import type { Auth0ContextInterface, User } from "@auth0/auth0-react";
import styled, { useTheme } from "styled-components";
import type { Game } from "../data/Game";
import { useContext, useState, type ChangeEvent } from "react";
import { Challenge, ChallengeType, ChallengeTypeToString, ContestEntryType, ContestEntryTypeToString } from "../data/Challenge";
import type Participant from "../data/Participant";
import Button from "./Button";
import { useDataService } from "../services/DataService";
import { PopupContext } from "../context/PopupContext";


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

.text_area_div {
    width: 80%;
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
    background-color: ${props => props.theme.bg_color_darkened};
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

textarea {
    width: 100%;
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

export const EditChallengePopup: React.FC<{ auth0interface: Auth0ContextInterface<User>, currentGame: Game, participant: Participant, allParticipants: { [key: string]: Participant }, challenge: Challenge, updateChallenge: Function }> = ({ currentGame, challenge, updateChallenge }) => {
    const { updateChallenge: updateChallengeBackend } = useDataService();
    const { closePopup, openPopup } = useContext(PopupContext);
    const theme = useTheme();

    let challengeCopy = Object.assign(new Challenge(), challenge);
    challengeCopy.points_rewarded = [...challenge.points_rewarded];
    const [updatedChallenge, setUpdatedChallenge] = useState<Challenge>(challengeCopy);


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
            // Clean up the challenge if needed.

            updateChallengeBackend(currentGame, updatedChallenge);
            updateChallenge(updatedChallenge);
            closePopup(1);
        }


        openPopup({
            header: "Are you sure?",
            getBody: () => (
                <StyledWrapper>
                    <p>You are about to update a challenge.</p>
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
            <h1>General Info</h1>
            <div className="horizontal_align_wide">
                <p>Name</p>
                <input type="text" defaultValue={updatedChallenge.name} onChange={(e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
                    const instanceCopy = Object.assign(new Challenge(), updatedChallenge);
                    instanceCopy.name = e.target.value;
                    setUpdatedChallenge(instanceCopy);
                }} />
            </div>
            <div className="horizontal_align_wide">
                <p>Type</p>
                <select defaultValue={updatedChallenge.type} onChange={(e: ChangeEvent<HTMLSelectElement, HTMLSelectElement>) => {
                    const instanceCopy = Object.assign(new Challenge(), updatedChallenge);
                    instanceCopy.type = (e.target.value as unknown as ChallengeType);
                    if (instanceCopy.type == ChallengeType.Contest) {
                        instanceCopy.leaderboard_ordering = "COUNT(SUBMISSIONS) DESCENDING";
                    }
                    setUpdatedChallenge(instanceCopy);
                }}>
                    {
                        [ChallengeType.Solo, ChallengeType.Coop, ChallengeType.Contest].map((value, _) => 
                        <option key={value} value={value}>{ChallengeTypeToString(value)}</option>
                        )
                    }
                </select>
            </div>
            <div className="text_area_div">
                <p>Description</p>
                <textarea rows={5} cols={1} defaultValue={updatedChallenge.description} onChange={(e: ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>) => {
                    const instanceCopy = Object.assign(new Challenge(), updatedChallenge);
                    instanceCopy.description = e.target.value;
                    setUpdatedChallenge(instanceCopy);
                }} />
            </div>
            <h1>Start Conditions</h1>
            <div className="horizontal_align_wide">
                <p>Is Repeatable</p>
                <input type="checkbox" defaultChecked={updatedChallenge.repeatable} onChange={(e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
                    const instanceCopy = Object.assign(new Challenge(), updatedChallenge);
                    instanceCopy.repeatable = e.target.checked;
                    setUpdatedChallenge(instanceCopy);
                }} />
            </div>
            {updatedChallenge.type != ChallengeType.Solo && 
            <div className="horizontal_align_wide">
                <p>Min Player Count</p>
                <input type="number" defaultValue={updatedChallenge.min_players} onChange={(e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
                    const instanceCopy = Object.assign(new Challenge(), updatedChallenge);
                    instanceCopy.min_players = (e.target.value as unknown as number);
                    setUpdatedChallenge(instanceCopy);
                }} />
            </div>}
            {updatedChallenge.type != ChallengeType.Solo && 
            <div className="horizontal_align_wide">
                <p>Max Player Count</p>
                <input type="number" defaultValue={updatedChallenge.max_players} onChange={(e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
                    const instanceCopy = Object.assign(new Challenge(), updatedChallenge);
                    instanceCopy.max_players = (e.target.value as unknown as number);
                    if (updatedChallenge.type == ChallengeType.Contest && instanceCopy.max_players > updatedChallenge.points_rewarded.length) {
                        for (var i = updatedChallenge.points_rewarded.length; i < instanceCopy.max_players; i++) {
                            instanceCopy.points_rewarded.push(0);
                        }
                    } if (updatedChallenge.type == ChallengeType.Contest && instanceCopy.max_players < updatedChallenge.points_rewarded.length) {
                        for (var i = updatedChallenge.points_rewarded.length; i > instanceCopy.max_players; i--) {
                            instanceCopy.points_rewarded.pop();
                        }
                    }
                    setUpdatedChallenge(instanceCopy);
                }} />
            </div>}
            <div className="text_area_div">
                <p>Availability Conditions</p>
                <textarea rows={5} cols={1} defaultValue={updatedChallenge.availability_conditions} onChange={(e: ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>) => {
                    const instanceCopy = Object.assign(new Challenge(), updatedChallenge);
                    instanceCopy.availability_conditions = e.target.value;
                    setUpdatedChallenge(instanceCopy);
                }} />
            </div>
            <h1>Rewards</h1>
            {
                updatedChallenge.type != ChallengeType.Contest ? 
                <div className="horizontal_align_wide">
                    <p>Points Rewarded</p>
                    <input type="number" defaultValue={updatedChallenge.points_rewarded[0]} onChange={(e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
                        const instanceCopy = Object.assign(new Challenge(), updatedChallenge);
                        instanceCopy.points_rewarded[0] = (e.target.value as unknown as number);
                        setUpdatedChallenge(instanceCopy);
                    }} />
                </div>
                : 
                <div>
                    <p>Points Rewarded</p>
                    {
                        updatedChallenge.points_rewarded.map((value, index) => {
                            return <div key={index} className={"participant_entry" 
                                                                            + (index == 0 ? " first" : "") 
                                                                            + (index == updatedChallenge.points_rewarded.length - 1 ? " last" : "") 
                                                                            + (index % 2 == 0 ? " even" : " odd")}>
                                <p>Position {index+1}</p>
                                <input key={index} className={index % 2 == 0 ? "odd" : "even"} type="number" step={1} defaultValue={value} onChange={(e: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
                                    const instanceCopy = Object.assign(new Challenge(), updatedChallenge);
                                    instanceCopy.points_rewarded[index] = (e.target.value as unknown as number);
                                    setUpdatedChallenge(instanceCopy);
                            }} />
                        </div>
                    })
                    }
                </div>
            }
            {
                updatedChallenge.type == ChallengeType.Contest &&
                <div className="horizontal_align_wide">
                    <p>Contest Entry Type</p>
                    <select defaultValue={updatedChallenge.contest_entry_type} onChange={(e: ChangeEvent<HTMLSelectElement, HTMLSelectElement>) => {
                        const instanceCopy = Object.assign(new Challenge(), updatedChallenge);
                        instanceCopy.contest_entry_type = (e.target.value as unknown as ContestEntryType);
                        setUpdatedChallenge(instanceCopy);
                    }}>
                        {
                            [ContestEntryType.None, ContestEntryType.Integer, ContestEntryType.Float].map((value, _) => 
                            <option key={value} value={value}>{ContestEntryTypeToString(value)}</option>
                            )
                        }
                    </select>
                </div>
            }
            {
                updatedChallenge.type == ChallengeType.Contest &&
                <div className="text_area_div">
                    <p>Leaderboard Ordering</p>
                    <textarea rows={5} cols={1} defaultValue={updatedChallenge.leaderboard_ordering == null ? "COUNT(SUBMISSIONS) DESCENDING" : updatedChallenge.leaderboard_ordering} onChange={(e: ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>) => {
                        const instanceCopy = Object.assign(new Challenge(), updatedChallenge);
                        instanceCopy.leaderboard_ordering = e.target.value;
                        setUpdatedChallenge(instanceCopy);
                    }} />
                </div>
            }
            <div className="center_align">
                <Button text="Save" icon={null} disabled={false} color={theme.accent_color_5} onClick={savePopup} />
            </div>
        </StyledWrapper>
    );
}

export default EditChallengePopup;