import { useEffect, useState } from 'react'
import styled, { ThemeProvider } from 'styled-components'

import account_tab_icon from './assets/account_tab_icon.svg?react'
import challenges_tab_icon from './assets/challenges_tab_icon.svg?react'
import leaderboard_tab_icon from './assets/leaderboard_tab_icon.svg?react'
import './App.css'

import NavBar from './components/NavBar'
import Participant from './data/Participant'
import { User } from './data/User'
import { Game } from './data/Game';
import LeaderboardScreen from './screens/LeaderboardScreen'
import { useAuth0 } from '@auth0/auth0-react'
import UnauthorizedScreen from './screens/UnauthorisedScreen'
import ChallengeScreen from './screens/ChallengeScreen'
import ErrorScreen from './screens/ErrorScreen'
import { useDataService } from './services/DataService'
import LeaderboardEntry from './data/LeaderboardEntry'
import { AccountScreen } from './screens/AccountScreen'
import { removeFromArray } from './utils/utils'
import { PopupProvider } from './context/PopupContext'

const theme = {
  bg_color: '#202226',
  bg_color_darkened: '#1c1d1f',
  bg_color_lightened: '#36393f',
  text_color: '#ffffff',

  accent_color_1: '#b9530a',
  accent_color_2: '#779f7f',
  accent_color_3: '#435a4d',
  accent_color_4: '#2a3b41',
  accent_color_5: '#780909',

  leaderboard_color_1: '#3a3e45',
  leaderboard_color_2: '#565960',
  leaderboard_color_3: '#929292',

  text_font_family: '"Inter", sans-serif'
}

const StyledWrapper = styled.div`
width: 100%;
height: 100%;
position: absolute;
left: 0px;
top: 0px;
display: flex;
flex-direction: column;
align-items: center;
background-color: ${props => props.theme.accent_color_4};

.phone_dimensions {
  width: calc(min(100%, 500px));
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: ${props => props.theme.bg_color};

  position: relative;
}

fieldset {
  width: 100%;
  height: 100%;
  border: none;
}
    `;

function App() {
  const { getParticipant, getParticipants, getUser, addUser, getUserGames, loadUserPfp, getLeaderboard } = useDataService();
  const auth0interface = useAuth0();

  const [tab, setTab] = useState(1);
  const [myUser, setMyUser] = useState<User | null>(null);
  const [participatingGames, setParticipatingGames] = useState<Game[]>([]);
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [myParticipant, setMyParticipant] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<{ [key: string]: Participant }>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [adminEnabled, setAdminEnabled] = useState<boolean>(false);

  const onFirstRender = async () => {
    if (!auth0interface.isAuthenticated)
      return;

    // Get user.
    let foundUser: boolean = true;
    let user: User = await getUser(null, () => { }, (status: number, detail: string) => {
      if (status == 403 && detail == "Authenticated user is not registered in this application")
        foundUser = false;
      else
        console.log(`error ${status}: ${detail}`);
    });
    if (!foundUser)
      user = await addUser(Object.assign(new User(), {
        user_uuid: "_INVALID_UUID_",
        username: "New User",
        is_global_admin: false,
        location: "LEUVEN",
        game_uuids: new Set(),
        is_me: true,
        profile_picture: null
      }));
    user = await loadUserPfp(user);
    setMyUser(user);

    // Get games the user partakes in, convert to an array.
    const games: { [key: string]: Game } = await getUserGames(user);
    let gamesArray: Game[] = [];
    for (var key in games)
      gamesArray.push(games[key]);
    gamesArray = gamesArray.sort((a, b) => a.name.localeCompare(b.name))
    setParticipatingGames(gamesArray);

    // Set the current game.
    if (gamesArray.length > 0)
      setCurrentGame(gamesArray[0]);
  }
  useEffect(() => {
    onFirstRender();
  }, [auth0interface.isAuthenticated]);

  const onChangeCurrentGame = async () => {
    if (myUser == null || currentGame == null)
      return;
    const participant: Participant = await getParticipant(myUser, currentGame);
    setMyParticipant(participant);

    const allParticipants: { [key: string]: Participant } = await getParticipants(currentGame, myUser.user_uuid);
    for (var participant_uuid in allParticipants) {
      allParticipants[participant_uuid].user = await loadUserPfp(allParticipants[participant_uuid].user);
    }
    setParticipants(allParticipants);

    const leaderboardEntries: LeaderboardEntry[] = await getLeaderboard(currentGame, allParticipants);
    setLeaderboard(leaderboardEntries);
  }
  useEffect(() => {
    onChangeCurrentGame();
  }, [currentGame]);

  function updateUser(user: User) {
    setMyUser(user);

    const participantCopy = Object.assign(new Participant(), myParticipant);
    participantCopy.user = user;
    setMyParticipant(participantCopy);

    const participantsCopy: { [key: string]: Participant } = {};
    for (var key in participants) {
      if (key == user.user_uuid)
        participantsCopy[key] = participantCopy;
      else
        participantsCopy[key] = participants[key];
    }
    setParticipants(participantsCopy);

    const leaderboardCopy: LeaderboardEntry[] = [];
    for (var i = 0; i < leaderboard.length; i++) {
      if (leaderboard[i].participant.user.user_uuid == user.user_uuid) {
        leaderboardCopy[i] = new LeaderboardEntry();
        leaderboardCopy[i].participant = participantCopy;
        leaderboardCopy[i].points = leaderboard[i].points;
      }
      else
        leaderboardCopy[i] = leaderboard[i];
    }
    setLeaderboard(leaderboardCopy);
  }

  const joinGame = async (game_uuid: string) => {
    if (myUser == null)
      throw new Error("No user specified");
    // Get games the user partakes in, convert to an array.
    const games: { [key: string]: Game } = await getUserGames(myUser);
    let gamesArray: Game[] = [];
    for (var key in games) {
      gamesArray.push(games[key]);
    }
    gamesArray = gamesArray.sort((a, b) => a.name.localeCompare(b.name))
    setParticipatingGames(gamesArray);

    // Set the current game.
    if (gamesArray.length > 0)
      setCurrentGame(games[game_uuid]);
    else
      setCurrentGame(null);
  };

  if (!auth0interface.isAuthenticated)
    return (<ThemeProvider theme={theme}>
      <StyledWrapper>
        <div className="phone_dimensions">
          <UnauthorizedScreen />
        </div>
      </StyledWrapper>
    </ThemeProvider>)

  if (myUser === null)
    return (<ThemeProvider theme={theme}>
      <StyledWrapper>
        <div className="phone_dimensions">
          <ErrorScreen error={"You are not a valid user."} />
        </div>
      </StyledWrapper>
    </ThemeProvider>)

  if (currentGame === null || myParticipant === null || Object.keys(participants).length == 0)
    return (
      <ThemeProvider theme={theme}>
        <StyledWrapper>
          <div className="phone_dimensions">
            <PopupProvider>
              {/* <fieldset disabled={popup != null}> */}
              {/* disables interactivity when the popup is enabled. */}
              {<AccountScreen
                auth0interface={auth0interface}
                user={myUser}
                updateUser={updateUser}
                participant={myParticipant}
                adminEnabled={adminEnabled}
                setAdminEnabled={setAdminEnabled}
                currentGame={currentGame}
                allGames={participatingGames}
                setGame={setCurrentGame}
                leaveGame={(game: Game) => {
                  const index: number = participatingGames.indexOf(game);
                  if (game == currentGame) {
                    if (participatingGames.length == 1)
                      setCurrentGame(null);
                    else
                      setCurrentGame(participatingGames[(index + 1) % participatingGames.length]); // Cycle to the next game.
                  }
                  setParticipatingGames(removeFromArray(participatingGames, game));
                }}
                joinGame={joinGame}
              />}
              <NavBar tabs={["Account"]}
                icons={[account_tab_icon]}
                currentTab={0}
                setCurrentTab={(_) => { }} />
              {/* </fieldset>
            {popup == null || <PopupWindow {...popup}></PopupWindow>} */}
            </PopupProvider>
          </div>
        </StyledWrapper>
      </ThemeProvider>
    );


  return (
    <ThemeProvider theme={theme}>
      <StyledWrapper>
        <div className="phone_dimensions">
          <PopupProvider>
            {/* <fieldset disabled={popup != null}> */}
            {/* disables interactivity when the popup is enabled. */}
            {tab == 0 ? <ChallengeScreen auth0interface={auth0interface} user={myUser} participant={myParticipant} allParticipants={participants} currentGame={currentGame} /> :
              tab == 1 ? <LeaderboardScreen leaderboardEntries={leaderboard} /> :
                <AccountScreen
                  auth0interface={auth0interface}
                  user={myUser}
                  updateUser={updateUser}
                  participant={myParticipant}
                  adminEnabled={adminEnabled}
                  setAdminEnabled={setAdminEnabled}
                  currentGame={currentGame}
                  allGames={participatingGames}
                  setGame={setCurrentGame}
                  leaveGame={(game: Game) => {
                    const index: number = participatingGames.indexOf(game);
                    if (game == currentGame) {
                      if (participatingGames.length == 1)
                        setCurrentGame(null);
                      else
                        setCurrentGame(participatingGames[(index + 1) % participatingGames.length]); // Cycle to the next game.
                    }
                    setParticipatingGames(removeFromArray(participatingGames, game));
                  }}
                  joinGame={joinGame}
                />}
            <NavBar tabs={["Challenges", "Leaderboard", "Account"]}
              icons={[challenges_tab_icon, leaderboard_tab_icon, account_tab_icon]}
              currentTab={tab}
              setCurrentTab={setTab} />
            {/* </fieldset>
            {popup == null || <PopupWindow {...popup}></PopupWindow>} */}
          </PopupProvider>
        </div>
      </StyledWrapper>
    </ThemeProvider>
  );
}

export default App;
