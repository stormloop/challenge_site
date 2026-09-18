import styled, { useTheme } from 'styled-components'
import { NAVBAR_HEIGHT } from "../components/NavBar";
import { User } from '../data/User';
import { Game } from '../data/Game';
import type Participant from '../data/Participant';
import { useAuth0, type Auth0ContextInterface, type User as Auth0User } from '@auth0/auth0-react';
import { useContext, useState } from 'react';

import location_icon from '../assets/location_icon.svg?react'
import { useDataService } from '../services/DataService';
import Button from '../components/Button';
import Pfp from '../components/Pfp';
import { PopupContext } from '../context/PopupContext';

const PopupWrapper = styled.div`
.text_fields_container {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
}

input {
    background-color: ${props => props.theme.bg_color_darkened};
    border-radius: 16px;
    border: none;
    padding-left: 16px;
    margin: 5px;
}

select {
    background-color: ${props => props.theme.bg_color_darkened};
    border-radius: 16px;
    border: none;
    padding-left: 16px;
    padding-right: 16px;
    margin: 5px;
}

.footer {
    padding-top: 16px;
    display: flex;
    flex-direction: row;
    justify-content: end;
}

.pfp_edit_container {
    width: 100%;
    height: 128px;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
}

.pfp_preview {
    width: 128px;
}

.pfp_edit_container > div {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    align-items: right;
    padding-left: 32px;
}

.pfp {
    fill: #712020;
    width: 128px;
}

.hidden {
    display: none;
}
    `;

const StyledWrapperGameEditPopup = styled.div`
display: flex;
flex-direction: column;
justify-content: space-between;
overflow: auto;

input {
    background-color: ${props => props.theme.bg_color_darkened};
    border-radius: 16px;
    border: none;
    padding-left: 16px;
    margin: 5px;
    margin-bottom: 16px;
    line-height: 3em;
}

.participant_entry {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    padding: 8px 16px 8px 16px;
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

.center_align {
    display: flex;
    flex-direction: row;
    justify-content: space-around;
}
    `;

const GameEditpopupBody: React.FC<{participant: Participant, participants: { [key: string] : Participant}, currentGame: Game, setGame: Function }> = ({ participant, participants, currentGame, setGame }) => {
        const { leaveGame: leaveGameBackend, updateGame: updateGameBackend } = useDataService();
        const theme = useTheme();
        const { closePopup, openPopup } = useContext(PopupContext);

        function openKickPopup(participant: Participant) {
            const StyledWrapper = styled.div`
                display: flex;
                flex-direction: row;
                justify-content: space-between;
            `;
            
            openPopup({
                header: `Are you sure you want to kick ${participant.user.username}`,
                getBody: () => (
                    <StyledWrapper>
                        <Button color={theme.accent_color_3} text="Cancel" icon={null} disabled={false} onClick={closePopup} />
                        <Button color={theme.accent_color_5} text="Kick" icon={null} disabled={false} onClick={async () => {
                            if (currentGame == null)
                                throw new Error("No game specified")
                            const updatedGame: Game = Object.assign(new Game(), currentGame);
                            updatedGame.participant_uuids.delete(participant.user.user_uuid);
                            await leaveGameBackend(participant.user, currentGame, true);
                            setGame(updatedGame);
                            closePopup();
                        }} />
                    </StyledWrapper>
                ),

                onAbort: closePopup
            });
        }

        return (
            <StyledWrapperGameEditPopup>
                    <p>Name:</p>
                    <input id="game_name_input" type="text" defaultValue={currentGame?.name} />
                    <div className="center_align">
                        <Button text="Save" icon={null} disabled={false} color={theme.accent_color_1} onClick={async () => {
                                if (currentGame == null)
                                    throw new Error("No game specified")
                                const updatedGame: Game = Object.assign(new Game(), currentGame)
                                updatedGame.name = (document.getElementById("game_name_input") as HTMLInputElement).value;
                                await updateGameBackend(updatedGame);
                                setGame(updatedGame);
                        }} />
                    </div>
                    <p>Participants:</p>
                    {
                        [...currentGame?.participant_uuids ?? []].map((value, index) => {
                            return (
                                <div key={index} className={"participant_entry" 
                                                    + (index == 0 ? " first" : "") 
                                                    + (index == (Object.keys(participants).length ?? 1) - 1 ? " last" : "") 
                                                    + (value == participant?.user.user_uuid ? " highlighted" 
                                                            : (index % 2 == 0 ? " even" : " odd"))}>
                                    <p>{participants[value].user.username}</p>
                                    <Button text="Remove" icon={null} disabled={value == participant?.user.user_uuid} color={theme.accent_color_5} onClick={() => openKickPopup(participants[value])} />
                                </div>
                            );
                        })
                    }
                </StyledWrapperGameEditPopup>
        );
}

const AccountEditPopupBody: React.FC<{ auth0interface: Auth0ContextInterface<Auth0User>, user: User, updateUser: Function }> = ({ user, updateUser }) => {
    const { updateUser: updateUserBackend, updateUserPfp: updateUserPfpBackend } = useDataService();
    const theme = useTheme();
    const { closePopup } = useContext(PopupContext);

    const [hasUpdatedPfp, setHasUpdatedPfp] = useState<boolean>(false);
    const [newPfp, setNewPfp] = useState<File | null>(user.profile_picture);

    function saveNewSettings() {

        const updatedUser = Object.assign(new User(), user);
        updatedUser.username = (document.getElementById("username_input") as HTMLInputElement).value;
        updatedUser.location = (document.getElementById("location_dropdown") as HTMLSelectElement).value;
        if (hasUpdatedPfp) {
            updateUserPfpBackend(user.user_uuid, newPfp);
            updatedUser.profile_picture = newPfp;
        }
        updateUserBackend(user.user_uuid, updatedUser);
        updateUser(updatedUser);

        closePopup();
    }

    function onChangePfp(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files == null || e.target.files?.length == 0) {
            e.target.value = ""; // reset the file input so the same file can be selected next time.
            resetPfp();
            return;
        }

        setNewPfp(e.target.files[0]);
        setHasUpdatedPfp(true);
        e.target.value = ""; // reset the file input so the same file can be selected next time.
    }

    function resetPfp() {
        setNewPfp(null);
        setHasUpdatedPfp(true);
    }

    return (
        <PopupWrapper>
            {/* Pfp view + Edit button */}
            <p>Profile Picture:</p>
            <div className="pfp_edit_container">
                <div className="pfp_preview">
                    <Pfp background_color={theme.accent_color_5} pfp={newPfp} />
                </div>
                <div>
                    <Button text="Select" icon={null} color={theme.accent_color_1} disabled={false} onClick={() => (document.getElementById("pfp_select_input") as HTMLInputElement).click()} />
                    <Button text="Reset" icon={null} color={theme.accent_color_5} disabled={newPfp == null} onClick={resetPfp} />
                    <input className="hidden" id="pfp_select_input" type={"file"} accept="image/*" onChange={onChangePfp} />
                </div>
            </div>
            {/* Other fields */}
            <div className="text_fields_container">
                <p>Name:</p>
                <input id="username_input" type="text" defaultValue={user.username} />
            </div>
            <div className="text_fields_container">
                <p>Location:</p>
                <select id="location_dropdown" className="locationInput" defaultValue={user.location}>
                    <option value="BELGIUM">BELGIUM</option>
                    <option value="LEUVEN">LEUVEN</option>
                    <option value="FINLAND">FINLAND</option>
                    <option value="JYVÄSKYLÄ">JYVÄSKYLÄ</option>
                </select>
            </div>
            <div className="footer">
                <Button text="Save" icon={null} color={theme.accent_color_3} disabled={false} onClick={saveNewSettings} />
            </div>
        </PopupWrapper>
    );
}

const StyledWrapper = styled.div`
width: 100%;
height: calc(100% - ${NAVBAR_HEIGHT}px);
position: absolute;
left: 0px;
top: 0px;
display: flex;
flex-direction: column;
align-items: center;
gap: 32px;
overflow: none;

background-color: ${props => props.theme.bg_color};
font-family: ${props => props.theme.text_font_family};
color: ${props => props.theme.text_color};

padding: 64px 0px 0px 32px;
box-sizing: border-box;


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
    font-size: 40px;
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

.edit_name_button {
    fill: #393636;
    /* width: 100%; */
    height: 40px;
    cursor: pointer;
}

.edit_location_button {
    fill: #393636;
    /* width: 100%; */
    height: 30px;
    cursor: pointer;
}

.central_section {
    width: 100%;
    padding-right: 32px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: end;
    overflow-y: auto;
    gap: 8px;
    padding-bottom: 16px;
}

.central_section_div {
    width: 100%;
    padding-left: 32px;
    box-sizing: border-box;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
}

.central_section h1 {
    text-align: left;
    font-weight: normal;
    font-size: 20px;
    width: 100%;
    align-content: center;
    margin-block-start: 16px;
    margin-block-end: 0px;
}

select {
    background-color: ${props => props.theme.bg_color_darkened};
    border-radius: 16px;
    border: none;
    padding: 16px;
    padding-right: 16px;
    margin: 5px;
    color: ${props => props.theme.text_color};
}

`;

export const AccountScreen: React.FC<{ auth0interface: Auth0ContextInterface<Auth0User>, user: User, updateUser: Function, participant: Participant | null, participants: { [key: string] : Participant}, adminEnabled: boolean, setAdminEnabled: Function, currentGame: Game | null, allGames: Game[], setGame: Function, leaveGame: Function, joinGame: Function }> = ({ auth0interface, user, updateUser, participant, participants, adminEnabled, setAdminEnabled, currentGame, allGames, setGame, leaveGame, joinGame }) => {
    const { leaveGame: leaveGameBackend, joinGame: joinGameBackend } = useDataService();
    const { logout: logoutAuth0 } = useAuth0();
    const theme = useTheme();
    let LocationIcon = location_icon;
    const { closePopup, openPopup } = useContext(PopupContext);

    function openAccountEditPopup() {
        openPopup({
            header: "Edit Account Settings",
            getBody: () => AccountEditPopupBody({ auth0interface, user, updateUser }),

            onAbort: closePopup
        });
    }

    function openEditGamePopup() {
        if (currentGame == null)
            throw new Error("No game set")
        if (participant == null)
            throw new Error("No participant set")

        openPopup({
            header: `Editing Game`,
            getBody: () => (
                <GameEditpopupBody participant={participant} participants={participants} currentGame={currentGame} setGame={setGame} />
            ),

            onAbort: closePopup
        });
    }

    function openLeaveGamePopup() {
        const StyledWrapper = styled.div`
            display: flex;
            flex-direction: row;
            justify-content: space-between;
        `;

        openPopup({
            header: `Are you sure you want to leave ${currentGame?.name}`,
            getBody: () => (
                <StyledWrapper>
                    <Button color={theme.accent_color_5} text="Leave Current Game" icon={null} disabled={false} onClick={() => {
                        if (currentGame == null)
                            throw new Error("Tried to leave game 'null'");
                        leaveGame(currentGame);
                        leaveGameBackend(user, currentGame, false);
                        closePopup();
                    }} />
                </StyledWrapper>
            ),

            onAbort: closePopup
        });
    }

    function openJoinGamePopup() {
        const StyledWrapper = styled.div`
            display: flex;
            flex-direction: row;
            justify-content: space-between;

            input {
                background-color: ${props => props.theme.bg_color_darkened};
                border-radius: 16px;
                border: none;
                padding-left: 16px;
                margin: 5px;
            }
        `;

        openPopup({
            header: `Join new Game`,
            getBody: () => (
                <StyledWrapper>
                    <input id="game_uuid_input" type="text" placeholder="game uuid" />
                    <Button color={theme.accent_color_5} text="Cancel" icon={null} disabled={false} onClick={closePopup} />
                    <Button color={theme.accent_color_3} text="Join game" icon={null} disabled={false} onClick={async () => {
                        const new_game_uuid: string = (document.getElementById("game_uuid_input") as HTMLInputElement).value;
                        await joinGameBackend(user, new_game_uuid);
                        joinGame(new_game_uuid);
                        closePopup();
                    }} />
                </StyledWrapper>
            ),

            onAbort: closePopup
        });
    }

    function logout() {
        logoutAuth0({
            logoutParams: {
                returnTo: window.location.origin,
            },
        })
    }


    return (
        <StyledWrapper>
            <div className="upper_bar">
                <div className="pfp_container">
                    {
                        <Pfp background_color={theme.accent_color_5} pfp={user.profile_picture} />
                    }
                </div>

                <div className="name_location_container">
                    <div className="name_container">
                        <p>{user.username}</p>
                    </div>
                    <div className="location_container">
                        <LocationIcon className="icon" />
                        <p>{user.location}</p>
                    </div>
                </div>
            </div>
            <div className="central_section">
                <h1>Account details</h1>
                <Button color={theme.accent_color_1} text="Edit Account" icon={null} disabled={false} onClick={openAccountEditPopup} />
                <Button color={theme.accent_color_5} text="Log out" icon={null} disabled={false} onClick={logout} />

                <h1>Games</h1>
                <div className="central_section_div">
                    <p>Current Game:</p>
                    {allGames.length > 1 ? <select defaultValue={currentGame?.game_uuid} onChange={(value) => setGame(value)}>
                        {allGames.map((value, _) => {
                            return (
                                <option value={value.game_uuid}>{value.name}</option>
                            )
                        })}
                    </select> : <p>{allGames.length == 0 ? "None" : currentGame?.name}</p>
                    }
                </div>
                {((participant?.has_admin_permissions ?? false) || (user.is_global_admin && participant != null)) &&
                    (<div className="central_section_div">
                        <p>Admin Enabled:</p>
                        <input id="admin_checkbox" type="checkbox" defaultChecked={adminEnabled} value={"admin"} onChange={(value) => setAdminEnabled(value.target.checked)} />

                    </div>)
                }
                {allGames.length > 0 && adminEnabled && <Button color={theme.accent_color_1} text="Edit Current Game" icon={null} disabled={false} onClick={openEditGamePopup} />}
                {allGames.length > 0 && <Button color={theme.accent_color_5} text="Leave Current Game" icon={null} disabled={false} onClick={openLeaveGamePopup} />}
                <Button color={theme.accent_color_3} text="Join New Game" icon={null} disabled={false} onClick={openJoinGamePopup} />
            </div>
        </StyledWrapper>
    )
}

export default AccountScreen;