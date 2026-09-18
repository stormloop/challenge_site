import styled, { useTheme } from 'styled-components'
import { NAVBAR_HEIGHT } from "../components/NavBar";
import type { User } from '../data/User';
import type { Game } from '../data/Game';
import { Challenge, ChallengeType } from '../data/Challenge';
import { Challenge as ChallengeDisplay } from '../components/Challenge';
import { ChallengeInstance, ChallengeInstanceStatus } from '../data/ChallengeInstance';
import { OngoingChallengeInstance as OngoingChallengeInstanceDisplay } from '../components/OngoingChallengeInstance';
import { useContext, useEffect, useState } from 'react';
import SubNavBar, { SUBNAVBAR_HEIGHT } from '../components/SubNavBar';
import type Participant from '../data/Participant';
import type { Auth0ContextInterface, User as Auth0User } from '@auth0/auth0-react';
import { removeFromArray } from '../utils/utils';
import { useDataService } from '../services/DataService';
import Button from '../components/Button';
import { PopupContext } from '../context/PopupContext';
import EditChallengePopup from '../components/EditChallengepopup';

const TOP_PADDING: number = 100;
const BOTTOM_PADDING: number = 10;


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
position: absolute;
left: 0%;
top: 0px;
display: flex;
flex-direction: column;
align-content: center;
align-items: center;
background-color: ${props => props.theme.bg_color};

.central_message {
    width: 100%;
    text-align: center;
    color: ${props => props.theme.text_color};
    font-family: ${props => props.theme.text_font_family};
}

.scrollbox {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: ${TOP_PADDING}px;
    padding-bottom: ${BOTTOM_PADDING + SUBNAVBAR_HEIGHT}px;
    gap: 64px;
    overflow: auto;
}

.scrollbox > div {
    width: 80%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 64px;
}
    `;

export const ChallengeScreen: React.FC<{ auth0interface: Auth0ContextInterface<Auth0User>, user: User, adminEnabled: boolean, participant: Participant, allParticipants: { [key: string]: Participant }, currentGame: Game }> = ({ auth0interface, adminEnabled, participant, allParticipants, currentGame }) => {
    const { getChallengeInstances, getAllChallengeInstances, getVisibleChallenges, addChallenge: addChallengeBackend } = useDataService();
    const theme = useTheme();
    const { closePopup, openPopup } = useContext(PopupContext);

    // subtab 0: discover new challenges.
    // subtab 1: view ongoing challenges.
    // subtab 2: view completed challenges.
    const [subTab, setSubTab] = useState(1);

    // All available challenges.
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    // All ongoing/finished challenges.
    const [challengeInstances, setChallengeInstances] = useState<ChallengeInstance[]>([]);
    const onFirstRender = async () => {
        const challenges: Challenge[] = await getVisibleChallenges(currentGame, adminEnabled);
        challenges.sort((a, b) => {  // First sort by challenge type, then alphabetically by name.
            if (a.get_challenge_type() != b.get_challenge_type())
                return a.get_challenge_type() - b.get_challenge_type();
            return a.get_name().localeCompare(b.get_name());
        });
        setChallenges(challenges);

        let challengeInstances: ChallengeInstance[];
        if (adminEnabled)
            challengeInstances = await getAllChallengeInstances(currentGame, allParticipants);
        else
            challengeInstances = await getChallengeInstances(currentGame, participant, allParticipants, adminEnabled);
        setChallengeInstances(challengeInstances);
    };
    useEffect(() => {
        onFirstRender();
    }, []);

    async function addChallenge() {

        let newChallenge: Challenge = Object.assign(new Challenge(), {
            challenge_uuid: "1",
            name: "New challenge",
            game_uuid: currentGame.game_uuid,
            points_rewarded: [1],
            type: ChallengeType.Solo,
            description: "",
            repeatable: false,
            time_period_limit: null,
            time_date_limit: null,
            min_players: 1,
            max_players: 1,
            availability_conditions: "",
            startable: false,
            joinable: false,
            leaderboard_ordering: null,
            contest_entry_type: null
        });
        newChallenge = await addChallengeBackend(currentGame, newChallenge);
        challenges.push(newChallenge);
        setChallenges(challenges);
        openPopup({
                header: "Select existing challenge",
                getBody: () => {
                    return (
                        <EditChallengePopup 
                            auth0interface={auth0interface}
                            currentGame={currentGame}
                            participant={participant}
                            allParticipants={allParticipants}
                            challenge={newChallenge}
                            updateChallenge={updateChallenge}/>
                    );
                },
    
                onAbort: closePopup
            });
    }

    /**
     * Updates a challenge from challenges, and thus rerenders if necessary.
     * Does not update the backend.
     */
    function updateChallenge(index: number, newInstance: Challenge): void {
        const copyArray: Challenge[] = challenges.concat([]);
        copyArray[index] = newInstance;
        setChallenges(copyArray);
    }

    function deleteChallenge(index: number): void {
        const copyArray: Challenge[] = challenges.concat([]);
        copyArray.splice(index, 1);
        setChallenges(copyArray);
    }

    /**
     * Adds a challenge instance to challengeInstances, and thus rerenders if necessary.
     * Does not update the backend.
     */
    const addChallengeInstance = async (_: ChallengeInstance) => {
        const challenges: Challenge[] = await getVisibleChallenges(currentGame, adminEnabled);
        challenges.sort((a, b) => {  // First sort by challenge type, then alphabetically by name.
            if (a.get_challenge_type() != b.get_challenge_type())
                return a.get_challenge_type() - b.get_challenge_type();
            return a.get_name().localeCompare(b.get_name());
        });
        setChallenges(challenges);

        let challengeInstances: ChallengeInstance[];
        if (adminEnabled)
            challengeInstances = await getAllChallengeInstances(currentGame, allParticipants);
        else
            challengeInstances = await getChallengeInstances(currentGame, participant, allParticipants, adminEnabled);
        setChallengeInstances(challengeInstances);
    }

    /**
     * Removes a challenge instance from challengeInstances, and thus rerenders if necessary.
     * Does not update the backend.
     */
    function removeChallengeInstance(instance: ChallengeInstance): void {
        const copyArray: ChallengeInstance[] = challengeInstances.concat([]);
        setChallengeInstances(removeFromArray(copyArray, instance));
        participant.challenge_instance_uuids.delete(instance.challenge_instance_uuid);
        console.warn("unsafe call here? not sure if editing participant like this is a good habit... we do however want to avoid refetching data");
    }

    /**
     * Updates a challenge instance from challengeInstances, and thus rerenders if necessary.
     * Does not update the backend.
     */
    function updateChallengeInstance(index: number, newInstance: ChallengeInstance): void {
        const copyArray: ChallengeInstance[] = challengeInstances.concat([]);
        copyArray[index] = newInstance;
        setChallengeInstances(copyArray);
    }

    return (
        <StyledWrapper>
            <div className="scrollbox">
                {
                    subTab == 0 ? (
                        <div>
                            <Separator text="Solo Challenges" />
                            {challenges.length == 0 ? <p className="central_message">There are no solo challenges left to start, good job!</p> :
                                challenges.filter(challenge => challenge.type == ChallengeType.Solo && (challenge.is_startable(challengeInstances) || challenge.is_joinable(challengeInstances))).map((value: Challenge, index: number) => {
                                    return (
                                        <ChallengeDisplay key={value.challenge_uuid}
                                            auth0interface={auth0interface}
                                            currentGame={currentGame}
                                            participant={participant}
                                            adminEnabled={adminEnabled}
                                            allParticipants={allParticipants}
                                            challenge={value}
                                            updateChallenge={(newchallenge: Challenge) => updateChallenge(index, newchallenge)}
                                            deleteChallenge={() => deleteChallenge(index)}
                                            challengeInstances={challengeInstances}
                                            addChallengeInstance={addChallengeInstance} />
                                    )
                                })}
                            <Separator text="Cooperation Challenges" />
                            {challenges.length == 0 ? <p className="central_message">There are no cooperation challenges left to start, good job!</p> :
                                challenges.filter(challenge => challenge.type == ChallengeType.Coop && (challenge.is_startable(challengeInstances) || challenge.is_joinable(challengeInstances))).map((value: Challenge, index: number) => {
                                    return (
                                        <ChallengeDisplay key={value.challenge_uuid}
                                            auth0interface={auth0interface}
                                            currentGame={currentGame}
                                            participant={participant}
                                            adminEnabled={adminEnabled}
                                            allParticipants={allParticipants}
                                            challenge={value}
                                            updateChallenge={(newchallenge: Challenge) => updateChallenge(index, newchallenge)}
                                            deleteChallenge={() => deleteChallenge(index)}
                                            challengeInstances={challengeInstances}
                                            addChallengeInstance={addChallengeInstance} />
                                    )
                                })}
                            <Separator text="Contests" />

                            {challenges.length == 0 ? <p className="central_message">There are no contests left to start, good job!</p> :
                                challenges.filter(challenge => challenge.type == ChallengeType.Contest && (challenge.is_startable(challengeInstances) || challenge.is_joinable(challengeInstances))).map((value: Challenge, index: number) => {
                                    return (
                                        <ChallengeDisplay key={value.challenge_uuid}
                                            auth0interface={auth0interface}
                                            currentGame={currentGame}
                                            participant={participant}
                                            adminEnabled={adminEnabled}
                                            allParticipants={allParticipants}
                                            challenge={value}
                                            updateChallenge={(newchallenge: Challenge) => updateChallenge(index, newchallenge)}
                                            deleteChallenge={() => deleteChallenge(index)}
                                            challengeInstances={challengeInstances}
                                            addChallengeInstance={addChallengeInstance} />
                                    )
                                })}
                            {adminEnabled && <Button text="+" icon={null} disabled={false} color={theme.accent_color_3} onClick={addChallenge}/>}
                        </div>) :
                        subTab == 1 ? (
                            <div>
                                <Separator text="Ongoing Challenges" />
                                {challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.Ongoing).length == 0 ? <p className="central_message">You have no ongoing challenges, go to the 'Discover' tab to start one.</p> :
                                    challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.Ongoing)
                                        .filter((value, _, __) => value.status == ChallengeInstanceStatus.Ongoing).map((value: ChallengeInstance, index: number) => {
                                            return (
                                                <OngoingChallengeInstanceDisplay key={value.challenge_instance_uuid}
                                                    auth0interface={auth0interface}
                                                    currentGame={currentGame}
                                                    participant={participant}
                                                    adminEnabled={adminEnabled}
                                                    participants={allParticipants}
                                                    challengeInstance={value}
                                                    updateChallengeInstance={(instance: ChallengeInstance) => updateChallengeInstance(index, instance)}
                                                    leaveChallengeInstance={() => removeChallengeInstance(value)} />
                                            )
                                        })}
                                <Separator text="Challenges Under Review" />
                                {challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.UnderReview).length == 0 ? <p className="central_message">There are currently no challenges under review.</p> :
                                    challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.UnderReview).map((value: ChallengeInstance, index: number) => {
                                        return (
                                            <OngoingChallengeInstanceDisplay key={value.challenge_instance_uuid}
                                                auth0interface={auth0interface}
                                                currentGame={currentGame}
                                                participant={participant}
                                                adminEnabled={adminEnabled} 
                                                participants={allParticipants}
                                                challengeInstance={value}
                                                updateChallengeInstance={(instance: ChallengeInstance) => updateChallengeInstance(index, instance)}
                                                leaveChallengeInstance={() => removeChallengeInstance(value)} />
                                        )
                                    })}
                            </div>
                        ) : (
                            <div>
                                {/* <Separator text="Approved Challenges" /> */}
                                {challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.Approved).length == 0 ? <p className="central_message">You have not finished any challenges yet, hurry up!</p> :
                                    challengeInstances.filter((value, _, __) => value.status == ChallengeInstanceStatus.Approved).map((value: ChallengeInstance, index: number) => {
                                        return (
                                            <OngoingChallengeInstanceDisplay key={value.challenge_instance_uuid}
                                                auth0interface={auth0interface}
                                                currentGame={currentGame}
                                                participant={participant}
                                                adminEnabled={adminEnabled}     
                                                participants={allParticipants}
                                                challengeInstance={value}
                                                updateChallengeInstance={(instance: ChallengeInstance) => updateChallengeInstance(index, instance)}
                                                leaveChallengeInstance={() => removeChallengeInstance(value)} />
                                        )
                                    })}
                            </div>
                        )
                }
            </div>
            <SubNavBar tabs={["Discover", "Started", "Finished"]}
                currentTab={subTab}
                setCurrentTab={setSubTab} />
        </StyledWrapper>)
}

export default ChallengeScreen;