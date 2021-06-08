import { load } from "./configs.ts";
import { CookieFetcher, Fetcher } from "./utils.ts";

export interface ReviewsRequest {
  limit: number;
  query?: string;
  sortBy?: string;
  projectId?: string;
  skip?: number;
}

export interface Resulting<T> {
  result: T;
}

export interface CompletionRate {
  completedCount: number;
  reviewersCount: number;
  hasConcern: boolean;
}

export interface ReviewList {
  reviews: Review[] | undefined;
  hasMore: boolean;
  totalCount: number;
}

export interface CurrentUserResponse {
  userId: string;
}

export interface RevisionInfo {
  projectId: string;
  revisionId: string;
  reachability: number;
  revisionCommitMessage: string;
  vcsRevisionId: string;
  tags: string[];
  parentRevisionIds: string[];
}

export enum RevisionReachability {
  Reachable = 1,
  Unknown,
  NotReachable,
}

export interface RevisionDescriptorList {
  revision?: RevisionInfo[];
}

export interface RevisionsInReviewResponse {
  allRevisions: RevisionDescriptorList;
  canSquash: boolean;
}

export interface ParticipantInReview {
  userId: string;
  state?: ParticipantState;
  role: RoleInReview;
}

export enum RoleInReview {
  Author = 1,
  Reviewer,
  Watcher,
}

export enum ParticipantState {
  Unread = 1,
  Read,
  Accepted,
  Rejected,
}

export interface Review {
  reviewId: ReviewId;
  title: string; // unused while creation!
  completionRate: CompletionRate;
  participants: ParticipantInReview[];
  createdBy: string;
  updatedAt: number;
  isUnread: boolean;
}

export interface RenameReviewRequest {
  reviewId: ReviewId;
  text: string;
}

export interface RenameReviewResponse {
  // ...
}

export type EditReviewDescriptionRequest = RenameReviewRequest;
export type EditReviewDescriptionResponse = RenameReviewResponse;

export interface ProjectId {
  projectId: string;
}

export interface ReviewId {
  projectId: string;
  reviewId: string;
}

export interface CreateReviewRequest {
  title?: string;
  projectId: string;
  revisions?: string[];
  branch?: string;
  mergeFromBranch?: string;
  mergeToBranch?: string;
}

export interface RevisionsInReview {
  reviewId: ReviewId;
  revisionId: string;
}

export interface VoidMessage {
}

export interface Err {
  error: {
    code: number;
    message: string;
  };
}

export interface VscRepo {
  id: string;
  url: string[];
}

export interface VcsRepoList {
  repo: VscRepo[];
}

export class UpsourceService {
  private myId?: string;

  constructor(private api: UpsourceApi) {
  }

  async getMyId(): Promise<string> {
    return this.myId = this.myId ??
      (await this.api.getCurrentUser()).result.userId;
  }

  async getAllMyReviews({ filter = "", limit = 100 } = {}) {
    filter = filter ? ` and (${filter})` : "";
    return this.getReviews({
      query: `(state: open and (reviewer: me or author: me)) ${filter}`,
      limit,
    });
  }

  async getReviews({ query = "", limit = 100 } = {}) {
    return this.api.getReviews({ limit, query });
  }

  async output(reviews: Review[]) {
    const myId = await this.getMyId();
    return reviews
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .map((r) => ({
        url:
          `${this.api.host}/${r.reviewId.projectId}/review/${r.reviewId.reviewId}`,
        updatedAt: (new Date(r.updatedAt)).toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
        }),
        myBranch: r.createdBy === myId,
        completed: r.createdBy === myId
          ? r.isUnread || !r.completionRate.hasConcern
          : r.participants.some((p) =>
            p.userId === myId && p.state && [
              ParticipantState.Accepted,
              ParticipantState.Rejected,
            ].includes(p.state)
          ),
      }));
  }

  private async getMyReviews(
    { author = false, limit = 100 },
  ): Promise<Err | Resulting<ReviewList>> {
    const me = author ? "author" : "reviewer";
    return this.api.getReviews({
      limit,
      query: `state: open and ${me}: me`,
    });
  }
}

export function createUpsourceApi() {
  const session = (() => {
    let c: { authorization: string; host: string; cookies: string };
    let prev = 0;
    return () => {
      const now = (new Date()).getTime();
      const minute = 1000 * 60;
      const duration = now - prev;
      if (duration < minute) {
        return c;
      }
      prev = now;
      c = load("upsource");
      return c;
    };
  })();

  return new UpsourceApi(
    session().host,
    () => session().authorization,
    new CookieFetcher(() => session().cookies),
  );
}

// https://upsource.jetbrains.com/~api_doc/reference/Service.html#messages.UpsourceRPC
export class UpsourceApi {
  constructor(
    public host: string,
    private authorization: () => string,
    private fetcher: Fetcher,
  ) {
  }

  private static isErr<T>(e: T | Err): e is Err {
    return !!(e as unknown as Err).error;
  }

  async getReviews(dto: ReviewsRequest = { limit: 10 }) {
    return this.rpc<Resulting<ReviewList>>("getReviews", dto);
  }

  async createReview(dto: CreateReviewRequest) {
    return this.rpc<Resulting<Review>>("createReview", dto);
  }

  async renameReview(dto: RenameReviewRequest) {
    return this.rpc<RenameReviewResponse>("renameReview", dto);
  }

  async editReviewDescription(dto: EditReviewDescriptionRequest) {
    return this.rpc<EditReviewDescriptionResponse>(
      "editReviewDescription",
      dto,
    );
  }

  async addRevisionToReview(dto: RevisionsInReview) {
    return this.rpc<VoidMessage>("addRevisionToReview", dto);
  }

  async getCurrentUser() {
    return this.rpc<Resulting<CurrentUserResponse>>("getCurrentUser", {});
  }

  async getRevisionsInReview(dto: ReviewId) {
    return this.rpc<Resulting<RevisionsInReviewResponse>>(
      "getRevisionsInReview",
      dto,
    );
  }

  async getProjectVcsLinks(dto: ProjectId) {
    return this.rpc<Resulting<VcsRepoList>>("getProjectVcsLinks", dto);
  }

  async rpc<T>(name: string, body: object): Promise<T> {
    const headers: HeadersInit = {
      "content-type": "application/json",
    };
    const auth = this.authorization();
    if (auth) {
      headers["authorization"] = auth;
    }
    const json: T | Err =
      await (await this.fetcher.fetch(`${this.host}/~rpc/${name}`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
      })).json();

    if (UpsourceApi.isErr(json)) {
      throw new UpsourceError(json);
    }

    return json;
  }

  getReviewUrl(reviewId: ReviewId): string {
    return `${this.host}/${reviewId.projectId}/review/${reviewId.reviewId}`;
  }
}

export class UpsourceError extends Error {
  static CODE_BRANCH_NOT_FOUND = 106;

  constructor(private e: Err) {
    super();
  }

  get code() {
    return this.e.error.code;
  }

  get message() {
    return `Upsource error #${this.e.error.code}: ${this.e.error.message}`;
  }
}
