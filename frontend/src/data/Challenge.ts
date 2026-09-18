import { ChallengeInstance, ChallengeInstanceStatus } from "./ChallengeInstance";

const ChallengeType = {
    Solo : 0,
    Coop : 1,
    Contest : 2
} as const;
type ChallengeType = (typeof ChallengeType)[keyof typeof ChallengeType];
export { ChallengeType };
export function ChallengeTypeToString(type: ChallengeType) : string {
    return type == ChallengeType.Solo ? "Solo"
            : type == ChallengeType.Coop ? "Co-op"
            : type == ChallengeType.Contest ? "Contest"
            : "_INVALID_CHALLENGE_TYPE_";
}

const ChallengeSpecificationType = {
    ChallengeType : 0,
    String : 1,
    Number : 2,
    Boolean : 3,
    Date : 4,
    TimePeriod : 5,
} as const;
type ChallengeSpecificationType = (typeof ChallengeSpecificationType)[keyof typeof ChallengeSpecificationType];
export { ChallengeSpecificationType };

const ContestEntryType = {
    None : 0,
    Integer : 1,
    Float : 2,
} as const;
type ContestEntryType = (typeof ContestEntryType)[keyof typeof ContestEntryType];
export { ContestEntryType };
export function ContestEntryTypeToString(type: ContestEntryType) : string {
    return type == ContestEntryType.None ? "None"
            : type == ContestEntryType.Integer ? "Integer"
            : type == ContestEntryType.Float ? "Float"
            : "_INVALID_CHALLENGE_TYPE_";
}

export class Challenge {
    challenge_uuid: string = "_INVALID_UUID_";
    name: string = "";
    points_rewarded: number[] = [0];
    type: ChallengeType = ChallengeType.Solo;
    description: string = "";
    repeatable: boolean = false;
    time_period_limit: string | null = null;
    time_date_limit: string | null = null;
    min_players: number = 1;
    max_players: number = 1;
    availability_conditions: string = "";
    startable: boolean = false;
    joinable: boolean = false;
    leaderboard_ordering: string = "";
    contest_entry_type: ContestEntryType = ContestEntryType.None;

    public get_uuid() : string { return this.challenge_uuid; }
    public get_name() : string { return this.name; }
    public get_points_rewarded() : number[] { return this.points_rewarded; }
    public get_challenge_type(): ChallengeType { return this.type; }
    public get_description(): string { return this.description; }
    public is_repeatable(): boolean { return this.repeatable; }
    public get_time_period_limit(): string | null { return this.time_period_limit; }
    public get_time_date_limit(): string | null { return this.time_date_limit; }
    public get_min_player_count(): number { return this.min_players; }
    public get_max_player_count(): number { return this.max_players; }
    public get_availability_conditions(): string { return this.availability_conditions; }

    public is_startable(challengeInstances: ChallengeInstance[]): boolean {
        return this.startable
                && this.type == ChallengeType.Solo
                || (
                    challengeInstances.filter(instance => instance.challenge.challenge_uuid == this.challenge_uuid && instance.status == ChallengeInstanceStatus.Ongoing).length == 0
                    && (this.is_repeatable() || challengeInstances.filter(instance => instance.challenge.challenge_uuid == this.challenge_uuid && instance.status != ChallengeInstanceStatus.Ongoing).length == 0)
                );
    }

    public is_joinable(challengeInstances: ChallengeInstance[]): boolean {
        return  this.joinable
                && challengeInstances.filter(instance => instance.challenge.challenge_uuid == this.challenge_uuid && instance.status == ChallengeInstanceStatus.Ongoing).length == 0
                && (this.is_repeatable() || challengeInstances.filter(instance => instance.challenge.challenge_uuid == this.challenge_uuid && instance.status != ChallengeInstanceStatus.Ongoing).length == 0)
    }

    public get_specifications(): [name: string, type: ChallengeSpecificationType, string_value: string][] { 
        // Returns the specifications we wish to display about this challenge, as a tuple array as 'specification_name', 'specification_type', 'specification_name'.
        if (this.get_challenge_type() == ChallengeType.Solo) {
            let specifications: [string, ChallengeSpecificationType, string][] = [["challenge type", ChallengeSpecificationType.ChallengeType, "Solo"],
                    ["repeatable", ChallengeSpecificationType.Boolean, this.is_repeatable() ? "Yes" : "No"],
                ];
            if (this.get_time_period_limit() != null) specifications.push(["time limit", ChallengeSpecificationType.TimePeriod, this.get_time_period_limit() as string]);
            if (this.get_time_date_limit() != null) specifications.push(["time limit", ChallengeSpecificationType.TimePeriod, this.get_time_date_limit() as string]);
            return specifications;
        }
        if (this.get_challenge_type() == ChallengeType.Contest) {
            let specifications: [string, ChallengeSpecificationType, string][] = [["challenge type", ChallengeSpecificationType.ChallengeType, "Contest"],
                    ["repeatable", ChallengeSpecificationType.Boolean, this.is_repeatable() ? "Yes" : "No"],
                    ["allowed player counts", ChallengeSpecificationType.Number, this.get_min_player_count() == this.get_max_player_count() ? "" + this.get_max_player_count() : `${this.get_min_player_count()} to ${this.get_max_player_count()}`],
                ];
            if (this.get_time_period_limit() != null) specifications.push(["time limit", ChallengeSpecificationType.TimePeriod, this.get_time_period_limit() as string]);
            if (this.get_time_date_limit() != null) specifications.push(["time limit", ChallengeSpecificationType.TimePeriod, this.get_time_date_limit() as string]);
            return specifications;
        }
        if (this.get_challenge_type() == ChallengeType.Coop) {
            let specifications: [string, ChallengeSpecificationType, string][] = [["challenge type", ChallengeSpecificationType.ChallengeType, "Co-op"],
                    ["repeatable", ChallengeSpecificationType.Boolean, this.is_repeatable() ? "Yes" : "No"],
                    ["allowed player counts", ChallengeSpecificationType.Number, this.get_min_player_count() == this.get_max_player_count() ? "" + this.get_max_player_count() : `${this.get_min_player_count()} to ${this.get_max_player_count()}`],
                ];
            if (this.get_time_period_limit() != null) specifications.push(["time limit", ChallengeSpecificationType.TimePeriod, this.get_time_period_limit() as string]);
            if (this.get_time_date_limit() != null) specifications.push(["time limit", ChallengeSpecificationType.TimePeriod, this.get_time_date_limit() as string]);
            return specifications;
        }
        throw new Error("Invalid Challenge type");
    }
}