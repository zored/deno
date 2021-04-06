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
  reviews: ReviewDescriptor[];
  hasMore: boolean;
  totalCount: number;
}

interface ReviewDescriptor {
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
  projectId: string;
  revisions?: string[];
  branch?: string;
  mergeFromBranch?: string;
  mergeToBranch?: string;
}

// https://upsource.jetbrains.com/~api_doc/reference/Service.html#messages.UpsourceRPC
export class UpsourceApi {
  constructor(private host: string, private authorizationHeader: string) {
  }

  getReviews = async (dto: ReviewsRequest = { limit: 10 }) =>
    this.rpc<Resulting<ReviewList>>("getReviews", dto);
  createReview = async (dto: CreateReviewRequest) =>
    this.rpc<ReviewDescriptor>("createReview", dto);

  private async rpc<T>(name: string, body: object): Promise<T> {
    return await (await fetch(`${this.host}/~rpc/${name}`, {
      method: "POST",
      headers: {
        authorization: this.authorizationHeader,
      },
      body: JSON.stringify(body),
    })).json();
  }
}
