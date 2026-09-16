// Provides specialized hooks to get important data from the backend API.
// All functions have an optional 'forceFetch' parameter, which will make sure the returned value is the latest version from the backend, and not a cached value.

import { Challenge } from "../data/Challenge";
import { ChallengeInstance } from "../data/ChallengeInstance";
import { ChallengeSubmission } from "../data/ChallengeSubmission";
import { Game } from "../data/Game";
import LeaderboardEntry from "../data/LeaderboardEntry";
import Participant from "../data/Participant";
import { User } from "../data/User";
import { APIBatchRequest, APIRequest, ContentType, RequestType, useToken, type BatchRequestProps } from "./BackendService";

const DEFAULT_SET_LOADING = (_: boolean) => { };
const DEFAULT_SET_ERROR = (status: number, detail: string) => { console.log(`error ${status}: ${detail}`) };


export function useDataService() {
    const { getToken } = useToken();

    /**
     * Returns the specified user profile, or the profile of the requesting user, if no uuid is specified.
     */
    const getUser = async (user_uuid: string | null = null,
                            setLoading: Function = DEFAULT_SET_LOADING,
                            setError: Function = DEFAULT_SET_ERROR) : Promise<User> =>  {
        const response: any = await APIRequest( {
            token: await getToken(),
            endpoint: user_uuid == null ? "/users/me" : `/users/${user_uuid}`,
            requestType: RequestType.GET,
            bodyContentType: ContentType.JSON,
            responseContentType: ContentType.JSON,
            setLoading: setLoading,
            setError: setError,
            body: null,
            });
        let user: User = Object.assign(new User(), response);
        user.game_uuids = new Set<string>(user.game_uuids);  // Convert game_uuids to a set.
        user.is_me = user_uuid == null;
        user.profile_picture = null;
        return user;
    }

    /**
     * Returns the specified user profile, or the profile of the requesting user, if no uuid is specified.
     */
    const addUser = async (user: User,
                            setLoading: Function = DEFAULT_SET_LOADING,
                            setError: Function = DEFAULT_SET_ERROR) : Promise<User> =>  {
        const response: any = await APIRequest( {
            token: await getToken(),
            endpoint: "/users",
            requestType: RequestType.POST,
            bodyContentType: ContentType.JSON,
            responseContentType: ContentType.JSON,
            setLoading: setLoading,
            setError: setError,
            body: user,
            });
        let returnedUser: User = Object.assign(new User(), response);
        returnedUser.game_uuids = new Set<string>(returnedUser.game_uuids);  // Convert game_uuids to a set.
        returnedUser.is_me = user.is_me;
        returnedUser.profile_picture = null;
        return returnedUser;
    }

    
    const updateUser = async (user_uuid: string,
                                updatedUser: User,
                                setLoading: Function = DEFAULT_SET_LOADING,
                                setError: Function = DEFAULT_SET_ERROR) : Promise<void> =>  {
        // Remove the pfp reference from the object.
        const {profile_picture, ...userWithoutPfp} = updatedUser; // Remove the profile picture from the object.

        await APIRequest( {
            token: await getToken(),
            endpoint: `/users/${user_uuid}`,
            requestType: RequestType.PUT,
            bodyContentType: ContentType.JSON,
            responseContentType: ContentType.JSON,
            setLoading: setLoading,
            setError: setError,
            body: userWithoutPfp,
        });
    }

    /**
     * Gets all games a user is part of, that are visible to this user.
     */
    const getUserGames = async (user: User,
                                    setLoading: Function = DEFAULT_SET_LOADING,
                                    setError: Function = DEFAULT_SET_ERROR) : Promise<{[key: string] : Game}> => {
        const batch: {[key: string] : BatchRequestProps} = {};
        for (var i = 0; i < user.game_uuids.size; i++) {
            batch[[...user.game_uuids][i]] = {
                endpoint: `/games/${[...user.game_uuids][i]}`,
                requestType: RequestType.GET,
                contentType: ContentType.JSON,
                body: null,
            };
        }

        const response: any = await APIBatchRequest( {
                token: await getToken(),
                batch: batch,
                setLoading: setLoading,
                setError: setError,
            });
        Object.keys(response).forEach(function(key, _) {
            response[key] = Object.assign(new Game(), response[key]);
        });
        return response;
    }

    const loadUserPfp = async (user: User,
                                setLoading: Function = DEFAULT_SET_LOADING,
                                setError: Function = DEFAULT_SET_ERROR) : Promise<User>  => {
        const userCopy: User = Object.assign(new User(), user);
        const hasPfp: boolean = await APIRequest( {
            token: await getToken(),
            endpoint: `/users/${user.user_uuid}/has_pfp`,
            requestType: RequestType.GET,
            bodyContentType: ContentType.JSON,
            responseContentType: ContentType.JSON,
            setLoading: setLoading,
            setError: setError,
            body: null,
            });
        if (!hasPfp) {
            userCopy.profile_picture = null;
            return userCopy;
        }

        const pfp: File = await APIRequest( {
            token: await getToken(),
            endpoint: `/users/${user.user_uuid}/pfp`,
            requestType: RequestType.GET,
            bodyContentType: ContentType.JSON,
            responseContentType: ContentType.FORMDATA,
            setLoading: setLoading,
            setError: setError,
            body: null,
            });
        userCopy.profile_picture = pfp;
        return userCopy;
    }

    const updateUserPfp = async (user_uuid: string,
                                    pfp: File | null,
                                    setLoading: Function = DEFAULT_SET_LOADING,
                                    setError: Function = DEFAULT_SET_ERROR) : Promise<void>  => {
        if (pfp != null) {
            const form: FormData = new FormData();
            form.append("updated_picture", pfp);

            await APIRequest( {
            token: await getToken(),
            endpoint: `/users/${user_uuid}/pfp`,
            requestType: RequestType.PUT,
            bodyContentType: ContentType.FORMDATA,
            responseContentType: ContentType.JSON,
            setLoading: setLoading,
            setError: setError,
            body: form,
            });
            return;
        }

        await APIRequest( {
        token: await getToken(),
        endpoint: `/users/${user_uuid}/pfp`,
        requestType: RequestType.DELETE,
        bodyContentType: ContentType.JSON,
        responseContentType: ContentType.JSON,
        setLoading: setLoading,
        setError: setError,
        body: null,
        });
    }

    const leaveGame = async (user: User,
                                game: Game,
                                setLoading: Function = DEFAULT_SET_LOADING,
                                setError: Function = DEFAULT_SET_ERROR) : Promise<void>  => {
        await APIRequest( {
            token: await getToken(),
            endpoint: `/games/${game.game_uuid}/participants/${user.user_uuid}`,
            requestType: RequestType.DELETE,
            bodyContentType: ContentType.JSON,
            responseContentType: ContentType.JSON,
            setLoading: setLoading,
            setError: setError,
            body: null,
        });
    }

    const joinGame = async (user: User,
                                game_uuid: string,
                                setLoading: Function = DEFAULT_SET_LOADING,
                                setError: Function = DEFAULT_SET_ERROR) : Promise<void>  => {
        await APIRequest( {
            token: await getToken(),
            endpoint: `/games/${game_uuid}/participants`,
            requestType: RequestType.POST,
            bodyContentType: ContentType.JSON,
            responseContentType: ContentType.JSON,
            setLoading: setLoading,
            setError: setError,
            body: user,
        });
    }

    /**
     * Gets a participant profile of a certain user in a certain game.
     */
    const getParticipant = async (user: User,
                                    game: Game,
                                    setLoading: Function = DEFAULT_SET_LOADING,
                                    setError: Function = DEFAULT_SET_ERROR) : Promise<Participant>  => {
        const response: any = await APIRequest( {
            token: await getToken(),
            endpoint: `/games/${game.game_uuid}/participants/${user.user_uuid}`,
            requestType: RequestType.GET,
            bodyContentType: ContentType.JSON,
            responseContentType: ContentType.JSON,
            setLoading: setLoading,
            setError: setError,
            body: null,
            });
        response.challenge_instance_uuids = new Set<string>(response.challenge_instance_uuids);  // Convert challenge_instance_uuids to a set.
        const participant: Participant = Object.assign(new Participant(), response);
        participant.user = user;
        return participant;
    }

    /**
     * Gets a participant profile of a certain user in a certain game.
     */
    const getParticipants = async (game: Game,
                                    my_user_uuid: string,
                                    setLoading: Function = DEFAULT_SET_LOADING,
                                    setError: Function = DEFAULT_SET_ERROR) : Promise<{[key: string] : Participant}>  => {
        const response: {[key: string] : Participant} = await APIRequest( {
            token: await getToken(),
            endpoint: `/games/${game.game_uuid}/participants`,
            requestType: RequestType.GET,
            bodyContentType: ContentType.JSON,
            responseContentType: ContentType.JSON,
            setLoading: setLoading,
            setError: setError,
            body: null,
            });
        const result: {[key: string] : Participant} = {};
        for (var key in response) {
            result[response[key].user.user_uuid] = Object.assign(new Participant(), response[key]);
            result[response[key].user.user_uuid].user = Object.assign(new User(), result[response[key].user.user_uuid].user);
        }
        result[my_user_uuid].user.is_me = true;
        return result;
    }

    /**
     * Gets the current leaderboard listing.
     */
    const getLeaderboard = async (game: Game,
                                    participants: { [key: string]: Participant },
                                    setLoading: Function = DEFAULT_SET_LOADING,
                                    setError: Function = DEFAULT_SET_ERROR) : Promise<LeaderboardEntry[]>  => {
        const response: [string, number][] = await APIRequest( {
            token: await getToken(),
            endpoint: `/games/${game.game_uuid}/leaderboard`,
            requestType: RequestType.GET,
            bodyContentType: ContentType.JSON,
            responseContentType: ContentType.JSON,
            setLoading: setLoading,
            setError: setError,
            body: null,
            });
        const result: LeaderboardEntry[] = [];
        for (var i = 0; i < response.length; i++) {
            const entry = new LeaderboardEntry();
            entry.participant = participants[response[i][0]];
            entry.points = response[i][1];
            result.push(entry);
        }
        return result;
    }

    /**
     * Returns a list of all challenges that are visible by this user.
     * If they have admin mode enabled, this is all challenges in the game.
     * Otherwise, it is only the challenges they can start.
     */
    const getVisibleChallenges = async (game: Game,
                                        admin_mode: boolean,
                                        setLoading: Function = DEFAULT_SET_LOADING,
                                        setError: Function = DEFAULT_SET_ERROR) : Promise<Challenge[]> => {
        if (admin_mode)
            throw new Error("Admin mode not implemented");
        const response: Set<Challenge> = await APIRequest( {
                token: await getToken(),
                endpoint: `/games/${game.game_uuid}/challenges`,
                requestType: RequestType.GET,
                bodyContentType: ContentType.JSON,
                responseContentType: ContentType.JSON,
                setLoading: setLoading,
                setError: setError,
                body: null,
                });
        return [...response].map((value: Challenge, _: number) => Object.assign(new Challenge(), value));
    }

    /**
     * Returns a list of all challenge instances by a certain participant that are visible by this user.
     * If they have admin mode enabled, this is all challenge instances of that participant.
     * Otherwise, it is only the challenges that are finished.
     */
    const getChallengeInstances = async (game: Game,
                                            participant: Participant,
                                            participants: {[key: string] : Participant},
                                            admin_mode: boolean,
                                            setLoading: Function = DEFAULT_SET_LOADING,
                                            setError: Function = DEFAULT_SET_ERROR) : Promise<ChallengeInstance[]> => {
        if (admin_mode)
            throw new Error("Admin mode not implemented");
        const batch: {[key: string] : BatchRequestProps} = {};
        for (var i = 0; i < participant.challenge_instance_uuids.size; i++) {
            batch[[...participant.challenge_instance_uuids][i]] = {
                endpoint: `/games/${game.game_uuid}/challenge_instances/${[...participant.challenge_instance_uuids][i]}`,
                requestType: RequestType.GET,
                contentType: ContentType.JSON,
                body: null,
            };
        }

        const response: { [key: string]: any } = await APIBatchRequest( {
                token: await getToken(),
                batch: batch,
                setLoading: setLoading,
                setError: setError,
            });
        
        let challengeInstanceArray: ChallengeInstance[] = [];
        for (var key in response) {
            const challengeInstance = Object.assign(new ChallengeInstance(), response[key]);
            challengeInstance.challenge = Object.assign(new Challenge(), challengeInstance.challenge);
            challengeInstance.leaderboard = challengeInstance.leaderboard == null ? [] : challengeInstance.leaderboard.map((value: any, _: any) => Object.assign(new LeaderboardEntry(), {participant: participants[value[0]], value: value[1] as number}));
            challengeInstanceArray.push(challengeInstance);
        }
        return challengeInstanceArray;
    }

    /**
     * Returns a list of all challenge instances that are joinable by this user for a certain challenge.
     */
    const getChallengeInstance = async (game: Game,
                                        challengeInstanceUuid: string,
                                        participants: {[key: string] : Participant},
                                        setLoading: Function = DEFAULT_SET_LOADING,
                                        setError: Function = DEFAULT_SET_ERROR) : Promise<ChallengeInstance> => {
        const response: any = await APIRequest( {
                token: await getToken(),
                endpoint: `/games/${game.game_uuid}/challenge_instances/${challengeInstanceUuid}`,
                requestType: RequestType.GET,
                bodyContentType: ContentType.JSON,
                responseContentType: ContentType.JSON,
                setLoading: setLoading,
                setError: setError,
                body: null,
                });
        const challengeInstance = Object.assign(new ChallengeInstance(), response);
        challengeInstance.leaderboard = challengeInstance.leaderboard == null ? [] : challengeInstance.leaderboard.map((value: any, _: any) => Object.assign(new LeaderboardEntry(), {participant: participants[value[0]], value: value[1] as number}));
        challengeInstance.challenge = Object.assign(new Challenge(), challengeInstance.challenge);
        
        return challengeInstance;
    }

    /**
     * Returns a list of all challenge instances that are joinable by this user for a certain challenge.
     */
    const getJoinableChallengeInstances = async (game: Game,
                                                    challenge: Challenge,
                                                    participants: {[key: string] : Participant},
                                                    setLoading: Function = DEFAULT_SET_LOADING,
                                                    setError: Function = DEFAULT_SET_ERROR) : Promise<ChallengeInstance[]> => {
        const response: { [key: string]: any } = await APIRequest( {
                token: await getToken(),
                endpoint: `/games/${game.game_uuid}/challenges/${challenge.challenge_uuid}/joinable_instances`,
                requestType: RequestType.GET,
                bodyContentType: ContentType.JSON,
                responseContentType: ContentType.JSON,
                setLoading: setLoading,
                setError: setError,
                body: null,
                });
        
        let challengeInstanceArray: ChallengeInstance[] = [];
        for (var key in response) {
            const challengeInstance = Object.assign(new ChallengeInstance(), response[key]);
            challengeInstance.leaderboard = challengeInstance.leaderboard == null ? [] : challengeInstance.leaderboard.map((value: any, _: any) => Object.assign(new LeaderboardEntry(), {participant: participants[value[0]], value: value[1] as number}));
            challengeInstanceArray.push(challengeInstance);
        }
        return challengeInstanceArray;
    }

    /**
     * Updates a challenge instance, for example to change its status.
     */
    const updateChallengeInstance = async(game: Game,
                                            newChallengeInstance: ChallengeInstance,
                                            admin_mode: boolean,
                                            setLoading: Function = DEFAULT_SET_LOADING,
                                            setError: Function = DEFAULT_SET_ERROR) : Promise<void> => {
        if (admin_mode)
            throw new Error("Admin mode not implemented");
        const {leaderboard, ...other_entries} = newChallengeInstance;
        const basicLeaderboard: [string, string][] | null = leaderboard == null ? null : leaderboard.map((value, _) => [value.participant.user.user_uuid, "" + value.points]);
        const apiRepresentation = {...other_entries, leaderboard: basicLeaderboard};

        await APIRequest( {
                token: await getToken(),
                endpoint: `/games/${game.game_uuid}/challenge_instances/${newChallengeInstance.challenge_instance_uuid}`,
                requestType: RequestType.PUT,
                bodyContentType: ContentType.JSON,
                responseContentType: ContentType.JSON,
                setLoading: setLoading,
                setError: setError,
                body: apiRepresentation,
            });
    }

    const joinChallengeInstance = async (game: Game,
                                        challengeInstance: ChallengeInstance,
                                        participant: Participant,
                                        admin_mode: boolean,
                                        setLoading: Function = DEFAULT_SET_LOADING,
                                        setError: Function = DEFAULT_SET_ERROR) : Promise<void> => {
        if (admin_mode)
            throw new Error("Admin mode not implemented");
        await APIRequest( {
                token: await getToken(),
                endpoint: `/games/${game.game_uuid}/challenge_instances/${challengeInstance.challenge_instance_uuid}/participants`,
                requestType: RequestType.POST,
                bodyContentType: ContentType.JSON,
                responseContentType: ContentType.JSON,
                setLoading: setLoading,
                setError: setError,
                body: participant,
            });
    }

    /**
     * Makes the specified participant leave a challenge instance.
     * If admin_mode is disabled, this can only be the user themselves.
     */
    const leaveChallengeInstance = async (game: Game,
                                            challengeInstance: ChallengeInstance,
                                            participant: Participant,
                                            admin_mode: boolean,
                                            setLoading: Function = DEFAULT_SET_LOADING,
                                            setError: Function = DEFAULT_SET_ERROR) : Promise<void> => {
        if (admin_mode)
            throw new Error("Admin mode not implemented");
        await APIRequest( {
                token: await getToken(),
                endpoint: `/games/${game.game_uuid}/challenge_instances/${challengeInstance.challenge_instance_uuid}/participants/${participant.user.user_uuid}`,
                requestType: RequestType.DELETE,
                bodyContentType: ContentType.JSON,
                responseContentType: ContentType.JSON,
                setLoading: setLoading,
                setError: setError,
                body: null,
            });
    }

    const addChallengeInstance = async (game: Game,
                                        challengeInstance: ChallengeInstance,
                                        admin_mode: boolean,
                                        setLoading: Function = DEFAULT_SET_LOADING,
                                        setError: Function = DEFAULT_SET_ERROR) : Promise<ChallengeInstance> => {
        if (admin_mode)
            throw new Error("Admin mode not implemented");
        const {leaderboard, ...other_entries} = challengeInstance;
        const basicLeaderboard: [string, string][] | null = leaderboard == null ? null : leaderboard.map((value, _) => [value.participant.user.user_uuid, "" + value.points]);
        const apiRepresentation = {...other_entries, leaderboard: basicLeaderboard};

        const result: ChallengeInstance = await APIRequest( {
                token: await getToken(),
                endpoint: `/games/${game.game_uuid}/challenge_instances`,
                requestType: RequestType.POST,
                bodyContentType: ContentType.JSON,
                responseContentType: ContentType.JSON,
                setLoading: setLoading,
                setError: setError,
                body: apiRepresentation,
            });
        const returnedChallengeInstance = Object.assign(new ChallengeInstance, result);
        returnedChallengeInstance.challenge = Object.assign(new Challenge, returnedChallengeInstance.challenge);
        return returnedChallengeInstance;
    }

    /**
     * Returns a list of all submissions in a certain challenge instance.
     */
    const getChallengeSubmissions = async (game: Game,
                                            challengeInstance: ChallengeInstance,
                                            setLoading: Function = DEFAULT_SET_LOADING,
                                            setError: Function = DEFAULT_SET_ERROR) : Promise<ChallengeSubmission[]> => {
        const response: Set<ChallengeSubmission> = await APIRequest( {
                token: await getToken(),
                endpoint: `/games/${game.game_uuid}/challenge_instances/${challengeInstance.challenge_instance_uuid}/submissions`,
                requestType: RequestType.GET,
                bodyContentType: ContentType.JSON,
                responseContentType: ContentType.JSON,
                setLoading: setLoading,
                setError: setError,
                body: null,
                });
        return [...response].map((value: ChallengeSubmission, _: number) => Object.assign(new ChallengeSubmission(), value));
    }

    /**
     * Adds a challenge submission to the specified challenge instance.
     */
    const addChallengeSubmission = async (game: Game,
                                            challengeInstance: ChallengeInstance,
                                            challengeSubmission: ChallengeSubmission,
                                            admin_mode: boolean,
                                            setLoading: Function = DEFAULT_SET_LOADING,
                                            setError: Function = DEFAULT_SET_ERROR) : Promise<ChallengeSubmission> => {
        if (admin_mode)
            throw new Error("Admin mode not implemented");
        const submissionForm: FormData = challengeSubmission.ToUploadRepresentation();

        const response: ChallengeSubmission = await APIRequest( {
                token: await getToken(),
                endpoint: `/games/${game.game_uuid}/challenge_instances/${challengeInstance.challenge_instance_uuid}/submissions`,
                requestType: RequestType.POST,
                bodyContentType: ContentType.FORMDATA,
                responseContentType: ContentType.JSON,
                setLoading: setLoading,
                setError: setError,
                body: submissionForm,
            }); // Returns the uuid assigned to the challenge submission.
        response.files = challengeSubmission.files // Add the actual files to the response, without explicitly requesting them.
        return Object.assign(new ChallengeSubmission(), response);
    }

    /**
     * Removes a challenge submission from the specified challenge instance.
     */
    const removeChallengeSubmission = async (game: Game,
                                            challengeInstance: ChallengeInstance,
                                            challengeSubmission: ChallengeSubmission,
                                            admin_mode: boolean,
                                            setLoading: Function = DEFAULT_SET_LOADING,
                                            setError: Function = DEFAULT_SET_ERROR) : Promise<void> => {
        if (admin_mode)
            throw new Error("Admin mode not implemented");
        await APIRequest( {
                token: await getToken(),
                endpoint: `/games/${game.game_uuid}/challenge_instances/${challengeInstance.challenge_instance_uuid}/submissions/${challengeSubmission.challenge_submission_uuid}`,
                requestType: RequestType.DELETE,
                bodyContentType: ContentType.JSON,
                responseContentType: ContentType.JSON,
                setLoading: setLoading,
                setError: setError,
                body: null,
            });
    }

    /**
     * Retrieves all files for a certain challenge submission and returns the result as a new challengeSubmission.
     */
    const getSubmissionFiles = async (game: Game,
                                        challengeInstance: ChallengeInstance,
                                        challengeSubmission: ChallengeSubmission,
                                        setLoading: Function = DEFAULT_SET_LOADING,
                                        setError: Function = DEFAULT_SET_ERROR) : Promise<ChallengeSubmission> => {
        if (challengeSubmission.files.length == challengeSubmission.filenames.length)
            return challengeSubmission;  // Files already loaded.

        const result = Object.assign(new ChallengeSubmission(), challengeSubmission);
        result.files = []; // Make it a new empty array, not a shallow copy of the one from challengeSubmission.
        for (var i = 0; i < result.filenames.length; i++) {
            const file: File = await APIRequest( {
                token: await getToken(),
                endpoint: `/games/${game.game_uuid}/challenge_instances/${challengeInstance.challenge_instance_uuid}/submissions/${challengeSubmission.challenge_submission_uuid}/files/${result.filenames[i]}`,
                requestType: RequestType.GET,
                bodyContentType: ContentType.JSON,
                responseContentType: ContentType.FORMDATA,
                setLoading: setLoading,
                setError: setError,
                body: null,
            });
            result.files.push(file);
        }
        return result;
    }

    return {
        getUser,
        updateUser,
        getUserGames,
        addUser,
        loadUserPfp,
        updateUserPfp,
        leaveGame,
        joinGame,
        getParticipant,
        getParticipants,
        getLeaderboard,
        getVisibleChallenges,
        getChallengeInstances,
        getChallengeInstance,
        getJoinableChallengeInstances,
        addChallengeInstance,
        joinChallengeInstance,
        updateChallengeInstance,
        leaveChallengeInstance,
        getChallengeSubmissions,
        getSubmissionFiles,
        addChallengeSubmission,
        removeChallengeSubmission
    }
}