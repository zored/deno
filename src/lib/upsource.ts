interface ReviewsRequest {
  limit: number;
  query?: string;
  sortBy?: string;
  projectId?: string;
  skip?: number;
}

interface Resulting<T> {
  result: T;
}

interface CompletionRateDTO {
  completedCount: number;
  reviewersCount: number;
  hasConcern: boolean;
}
interface ReviewList {
  reviews: ReviewDescriptor[] | undefined;
  hasMore: boolean;
  totalCount: number;
}

export interface ReviewDescriptor {
  reviewId: ReviewId;
  title: string;
  completionRate: CompletionRateDTO;
  updatedAt: number;
  isUnread: boolean;
}

interface ReviewId {
  projectId: string;
  reviewId: string;
}

interface CreateReviewRequest {
  title?: string;
  projectId: string;
  revisions?: string[];
  branch?: string;
  mergeFromBranch?: string;
  mergeToBranch?: string;
}

interface RevisionsInReview {
  reviewId: ReviewId;
  revisionId: string;
}

interface VoidMessage {}

export interface Err {
  error: {
    code: number;
    message: string;
  };
}

// https://upsource.jetbrains.com/~api_doc/reference/Service.html#messages.UpsourceRPC
export class UpsourceApi {
  constructor(private host: string, private authorizationHeader: string) {
  }

  getReviews = async (dto: ReviewsRequest = { limit: 10 }) =>
    this.rpc<Resulting<ReviewList>>("getReviews", dto);
  createReview = async (dto: CreateReviewRequest) =>
    this.rpc<ReviewDescriptor>("createReview", dto);
  addRevisionToReview = async (dto: RevisionsInReview) =>
    this.rpc<VoidMessage>("addRevisionToReview", dto);

  async rpc<T>(name: string, body: object): Promise<T | Err> {
    return await (await fetch(`${this.host}/~rpc/${name}`, {
      method: "POST",
      headers: {
        authorization: this.authorizationHeader,
      },
      body: JSON.stringify(body),
    })).json();
  }
}
