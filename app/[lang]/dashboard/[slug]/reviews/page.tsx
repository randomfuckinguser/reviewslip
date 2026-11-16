import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import ListingReviews, {
  type Listings,
  type NewReview,
} from "@/components/dashboard/ListingReviews";
import PageHeader from "@/components/app-shell/PageHeader";
import ReviewList, { type ReviewRow } from "@/components/dashboard/ReviewList";
import { call, sessionToken, type BusinessDetail } from "@/lib/customer";
import { isLocale } from "@/lib/i18n/config";
import { localizedPath } from "@/lib/i18n/routing";

export const metadata: Metadata = {
  title: "Reviews",
  robots: { index: false, follow: false },
};

/**
 * The reviews a venue has generated, and what its owner made of them.
 *
 * Off the venue page, which had become a hub with a long list bolted to the
 * bottom of it. The list wants room — forty reviews in a column beside a bar
 * chart is a scroll inside a scroll — and the numbers people open the dashboard
 * for should not be under it.
 */
export default async function ReviewsPage({
  params,
}: PageProps<"/[lang]/dashboard/[slug]/reviews">) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) notFound();

  const token = await sessionToken();
  if (!token) redirect(localizedPath(lang, "/login"));

  let data: BusinessDetail;
  try {
    data = await call<BusinessDetail>(`/businesses/${slug}`, { token });
  } catch (err) {
    // The API answers 404 for a business belonging to somebody else as well as
    // one that does not exist — deliberately, and it stays that way here.
    if ((err as { status?: number }).status === 404) notFound();
    throw err;
  }

  let reviews: ReviewRow[] = [];
  let notTaken = 0;
  let reviewsFailed = false;
  try {
    const answer = await call<{ reviews: ReviewRow[]; notTaken?: number }>(
      `/businesses/${slug}/reviews`,
      { token }
    );
    reviews = answer.reviews;
    // Optional: the review app deploys separately, and a dashboard running
    // ahead of it gets a list and no count rather than falling over.
    notTaken = answer.notTaken ?? 0;
  } catch (err) {
    // Kept apart from an empty list, because they are different facts and this
    // page used to tell the same story for both. A broken query behind this
    // call rendered "Nothing yet. Reviews appear here as guests generate them."
    // to an owner with forty-seven of them — which reads as a product that is
    // not working rather than one that is broken, and sends them looking in
    // entirely the wrong place.
    reviewsFailed = true;
    console.error(`Could not load reviews for ${slug}:`, err);
  }

  /**
   * Reviews already on the venue's listings.
   *
   * Optional in the strong sense: the review app deploys separately, and a
   * dashboard that has this route while the API does not must render the rest
   * of the page rather than 500. An owner whose reviews list vanished because
   * a second, newer panel could not load would reasonably conclude the whole
   * thing was broken.
   */
  let listings: Listings | null = null;
  try {
    listings = await call<Listings>(`/businesses/${slug}/listing-reviews`, { token });
  } catch (err) {
    if ((err as { status?: number }).status !== 404) {
      console.error(`Could not load listing reviews for ${slug}:`, err);
    }
  }

  /** Whether this one has been answered. Returns the fresh list with it. */
  async function setReplied(
    id: number,
    replied: boolean
  ): Promise<{ ok: boolean; data?: Listings }> {
    "use server";

    const current = await sessionToken();
    if (!current) return { ok: false };

    try {
      await call(`/businesses/${slug}/listing-reviews/${id}/replied`, {
        method: "POST",
        body: { replied },
        token: current,
      });
      const data = await call<Listings>(`/businesses/${slug}/listing-reviews`, {
        token: current,
      });
      return { ok: true, data };
    } catch {
      return { ok: false };
    }
  }

  /**
   * One added by hand, through the same route a connector would use.
   *
   * Which is the point of it: the de-duplication, the window and the reply
   * tracking are all on this side of the fetch, so a review typed in is a
   * review, not a lesser copy of one.
   */
  async function addReview(
    input: NewReview
  ): Promise<{ ok: boolean; error?: string; data?: Listings }> {
    "use server";

    const current = await sessionToken();
    if (!current) return { ok: false, error: "Sign in again to save that." };

    try {
      const data = await call<Listings>(`/businesses/${slug}/listing-reviews/import`, {
        method: "POST",
        body: {
          platform: input.platform,
          rows: [
            {
              author: input.author || null,
              rating: input.rating,
              body: input.body,
              postedAt: input.postedAt,
              url: input.url || null,
            },
          ],
        },
        token: current,
      });
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: (err as { message?: string }).message ?? "That could not be saved.",
      };
    }
  }

  /** Go and look now, for whichever listings can actually be read. */
  async function checkNow(): Promise<{ ok: boolean; error?: string; data?: Listings }> {
    "use server";

    const current = await sessionToken();
    if (!current) return { ok: false, error: "Sign in again to check." };

    try {
      const data = await call<Listings>(`/businesses/${slug}/listing-reviews/fetch`, {
        method: "POST",
        body: {},
        token: current,
      });
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: (err as { message?: string }).message ?? "Nothing could be fetched.",
      };
    }
  }

  /**
   * Records the owner's judgement. Called straight from the list's stars.
   *
   * `null` clears the rating, which is what a second tap on the star already
   * set means. The review app treats that as a distinct value rather than a
   * missing one, so it is sent as null rather than omitted.
   */
  async function rate(id: number, rating: number | null): Promise<{ ok: boolean }> {
    "use server";

    const current = await sessionToken();
    if (!current) return { ok: false };

    try {
      await call(`/businesses/${slug}/reviews/${id}/feedback`, {
        method: "POST",
        body: { rating },
        token: current,
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  const { business } = data;

  return (
    <>
      <PageHeader tour="reviews"
        title="Reviews"
        sub={business.name}
        back={localizedPath(lang, `/dashboard/${business.slug}`)}
      />
      <div className="page-body">
        <div className="cols-grid is-reviews">
          <div data-tour="rv-latest">
          <ReviewList
            reviews={reviews}
            notTaken={notTaken}
            failed={reviewsFailed}
            rate={rate}
          />
          </div>

          {listings && (
            <div data-tour="rv-listings">
            <ListingReviews
              initial={listings}
              markReplied={setReplied}
              addReview={addReview}
              checkNow={checkNow}
            />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
