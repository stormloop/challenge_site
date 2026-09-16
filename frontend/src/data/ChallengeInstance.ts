import { print_date } from "../utils/pretty_print";
import { Challenge, ChallengeType } from "./Challenge";
import type LeaderboardEntry from "./LeaderboardEntry";

const ChallengeInstanceStatus = {
    Ongoing : 0,
    UnderReview : 1,
    TimesUp : 2,
    Approved : 3,
    Failed : 4
} as const;
type ChallengeInstanceStatus = (typeof ChallengeInstanceStatus)[keyof typeof ChallengeInstanceStatus];
export { ChallengeInstanceStatus };
export function StatusToString(status: ChallengeInstanceStatus) {
    return status == ChallengeInstanceStatus.Ongoing ? "Ongoing" :
           status == ChallengeInstanceStatus.UnderReview ? "Under Review" :
           status == ChallengeInstanceStatus.Approved ? "Approved" : 
           status == ChallengeInstanceStatus.Failed ? "Failed" : 
           "_INVALID_STATUS_";
}

const ChallengeInstanceSpecificationType = {
    ChallengeInstanceStatus : 0,
    String : 1,
    Number : 2,
    Boolean : 3,
    Date : 4,
    TimePeriod : 5,
} as const;
type ChallengeInstanceSpecificationType = (typeof ChallengeInstanceSpecificationType)[keyof typeof ChallengeInstanceSpecificationType];
export { ChallengeInstanceSpecificationType };

export class ChallengeInstance {
    challenge_instance_uuid: string = "_INVALID_UUID_";
    challenge: Challenge = new Challenge();
    participant_uuids: Set<string> = new Set();
    challenge_submission_uuids: Set<string> | null = new Set();
    start_time: string = "";
    complete_time: string | null = null;
    status: ChallengeInstanceStatus = ChallengeInstanceStatus.Ongoing;

    overwrite_points: number[] | null = null;

    leaderboard: LeaderboardEntry[]  = [];
    overwrite_leaderboard_to_manual: boolean = false;

    public IsStatusChangeable(this: ChallengeInstance, isAdmin: boolean) {
        return isAdmin 
                || ((this.status == ChallengeInstanceStatus.Ongoing 
                        || this.status == ChallengeInstanceStatus.UnderReview)
                    && this.challenge.type != ChallengeType.Contest);
    }

    public IsSubmitPossible(isAdmin: boolean) : boolean {
        return isAdmin 
                || this.status == ChallengeInstanceStatus.Ongoing;
    }

    public IsChatPossible(_: boolean) : boolean {
        return true;
    }

    public IsShownInFinishedSubTab() : boolean {
        return this.status == ChallengeInstanceStatus.Approved 
                || this.status == ChallengeInstanceStatus.Failed
                || this.status == ChallengeInstanceStatus.TimesUp;
    }

    public getPointsForContest(index: number) : number {
        if (this.overwrite_points != null)
            return this.overwrite_points[index];
        return this.challenge.points_rewarded[index];
    }
    
    public get_specifications(): [name: string, type: ChallengeInstanceSpecificationType, string_value: string][] {
        return [["Status", ChallengeInstanceSpecificationType.ChallengeInstanceStatus, StatusToString(this.status)],
                ["Started at", ChallengeInstanceSpecificationType.Date, print_date(this.start_time)],
                ["Completed at", ChallengeInstanceSpecificationType.Date, this.complete_time == null ? "N/A" : print_date(this.complete_time)]];
    }
}