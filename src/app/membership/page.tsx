"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Home, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Badge, Button } from "@/components/ui";
import { PlanBenefits } from "@/app/landing/PlanBenefits";
import { LINE_OA_URL } from "@/lib/config";
import { lineSlipAction, lineSlipMessage } from "@/lib/lineSlipLink";
import { resolveWizardStep, shouldShowMembershipStepper, type WizardStep } from "@/lib/membershipSteps";
import { formatThaiDate, membershipApplicationPlanLabel } from "@/lib/membershipCopy";
import { readSlipSent, writeSlipSent } from "@/lib/slipSentMark";
import { resolveMembershipBodyMode } from "@/lib/membershipBodyMode";
import { MembershipStepper } from "./PaymentFlow";
import { ApplicationHistory, ApprovedPanel, SlipStep, TransferStep, WaitingStep, StepFrame } from "./WizardSteps";
import { trackEvent } from "@/lib/analytics";
import {
  convertFounderApplicationToTeacher,
  createMembershipApplication,
  fetchEntitlementsResult,
  fetchFounderCapacity,
  fetchMembershipReturnResource,
  fetchMyFounderHistory,
  fetchPlans,
  fetchUpgradeRequestsResult,
  type Plan,
  type UpgradeRequest,
} from "@/lib/data";
import { founderPublicNotice, type FounderCapacity } from "@/lib/founderCapacity";
import {
  fetchMembershipSchemaReadiness,
  MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE,
  type MembershipSchemaReadiness,
} from "@/lib/membershipSchemaReadiness";
import { createClient } from "@/lib/supabase/client";
import { EMPTY_ENTITLEMENTS, type EntitlementSnapshot } from "@/lib/entitlement";
import {
  canRequestMembershipRenewal,
  fetchMemberSubscription,
  type MemberSubscription,
} from "@/lib/memberAccount";
import {
  canStartMembershipApplication,
  entitlementSatisfiesRequestedPlan,
  founderChecksBlockPlan,
  founderChecksBlockPlanSelection,
  founderChecksRequiredForPlanSelection,
  founderApplicationConversionConfirmation,
  hasCurrentPaidMembership,
  membershipApplicationPlanMismatch,
  membershipAutoReturnDestination,
  membershipDisplayError,
  membershipPlanChangeConfirmation,
  membershipPlanUnlocksResource,
  membershipResourceHasSelectablePlan,
  membershipReturnResourceId,
  membershipReturnResourceState,
  membershipReturnTarget,
  pendingMembershipApplication,
  resolveMembershipPlanSelection,
  requestedMembershipPlan,
} from "@/lib/membershipJourney";
import { createLatestRefreshRunner } from "@/lib/latestRefresh";
import {
  failedMembershipChecks,
  failedMembershipChecksMessage,
  membershipChecksLoading,
  onlyFounderChecksFailed,
  planCheckLabel,
} from "@/lib/membershipChecks";
import { planDisplayName } from "@/lib/planDisplay";
import { FREE_SIGNUP_HREF } from "@/lib/authReturnPath";
import { isPermanentAuthUser } from "@/lib/authIdentity";

const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

type MembershipPlanId = "founder" | "teacher";

export default function MembershipPage() {
  return (
    <Suspense fallback={<div className="kru-membership-page" aria-busy="true" />}>
      <MembershipContent />
    </Suspense>
  );
}

function MembershipContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPlan = searchParams.get("plan");
  const requestedPlanId = requestedMembershipPlan(requestedPlan);
  const requestedReturnPaths = searchParams.getAll("returnTo");
  const requestedReturnTo = requestedReturnPaths.length === 1 ? requestedReturnPaths[0] : null;
  const returnTarget = membershipReturnTarget(requestedReturnTo);
  const returnTo = returnTarget.destination;
  const returnResourceId = membershipReturnResourceId(requestedReturnTo);
  const hasAutoReturned = useRef(false);
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(!isSupabaseConfigured);
  const [schemaReadiness, setSchemaReadiness] = useState<MembershipSchemaReadiness>(isSupabaseConfigured ? "checking" : "unavailable");
  const [capacity, setCapacity] = useState<FounderCapacity | null>(null);
  const [capacityLoaded, setCapacityLoaded] = useState(!isSupabaseConfigured);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanPreference, setSelectedPlanPreference] = useState<MembershipPlanId>(
    requestedPlanId ?? "founder",
  );
  const shouldLoadFounderChecks = founderChecksRequiredForPlanSelection(selectedPlanPreference);
  const [applications, setApplications] = useState<UpgradeRequest[]>([]);
  const [applicationsError, setApplicationsError] = useState(false);
  const [founderHistory, setFounderHistory] = useState(false);
  const [founderHistoryLoaded, setFounderHistoryLoaded] = useState(!isSupabaseConfigured);
  const [founderHistoryError, setFounderHistoryError] = useState(false);
  const [returnResourceRead, setReturnResourceRead] = useState<{
    resourceId: string;
    requiredPlanIds: string[];
    error: boolean;
  } | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementSnapshot>(EMPTY_ENTITLEMENTS);
  const [subscription, setSubscription] = useState<MemberSubscription | null>(null);
  const [memberStatusError, setMemberStatusError] = useState(false);
  // Which of the two reads behind memberStatusError failed (for the message only).
  const [entitlementsFailed, setEntitlementsFailed] = useState(false);
  const [subscriptionFailed, setSubscriptionFailed] = useState(false);
  const [memberStatusLoaded, setMemberStatusLoaded] = useState(!isSupabaseConfigured);
  const [submitting, setSubmitting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Wizard: the step the member moved to with next / back in this visit, and
  // whether "ส่งสลิปแล้ว" was pressed for the current reference (kept per
  // reference in this browser only, never in the database).
  const [requestedStep, setRequestedStep] = useState<WizardStep | null>(null);
  const [slipMark, setSlipMark] = useState<{ referenceCode: string; sent: boolean } | null>(null);
  const [slipFeedback, setSlipFeedback] = useState<string | null>(null);
  const [messageCopied, setMessageCopied] = useState(false);
  const [focusStepHeading, setFocusStepHeading] = useState(false);
  const [sawPendingApplication, setSawPendingApplication] = useState(false);
  const [stepScope, setStepScope] = useState<string | null | undefined>(undefined);

  // A legacy account can legitimately have an older pending application and a
  // newer resolved record. Keep the still-actionable request visible instead
  // of hiding it behind history; the membership schema migration prevents
  // more than one pending request per member once it is ready.
  const pendingApplication = pendingMembershipApplication(applications);
  const latestApplication = pendingApplication
    ?? applications[0]
    ?? null;
  const hasOpenApplication = pendingApplication !== null;
  const hasLocalFounderHistory = applications.some((application) => (
    application.planId === "founder" && application.status === "approved"
  )) || subscription?.planId === "founder";
  const hasFounderHistory = founderHistory || hasLocalFounderHistory;
  const founderHistoryKnown = !userId
    || hasLocalFounderHistory
    || (founderHistoryLoaded && !founderHistoryError);
  const founderChecksUnavailable = schemaReadiness !== "ready"
    || !capacityLoaded
    || capacity === null
    || (Boolean(userId) && !founderHistoryKnown);
  const checksInput = {
    isConfigured: isSupabaseConfigured,
    schemaReadiness,
    authLoaded,
    signedIn: Boolean(userId),
    memberStatusLoaded,
    capacityLoaded,
    founderHistoryLoaded,
    founderChecksNeeded: shouldLoadFounderChecks,
    capacityMissing: capacity === null,
    founderHistoryError,
    applicationsError,
    entitlementsError: entitlementsFailed,
    subscriptionError: subscriptionFailed,
  };
  const checksLoading = membershipChecksLoading(checksInput);
  const failedChecks = failedMembershipChecks(checksInput);
  const failedChecksKey = failedChecks.join(",");
  // Names of the failed reads only (never data), so a support screenshot of the console says which one.
  useEffect(() => {
    if (failedChecksKey) console.error(`membership checks failed: ${failedChecksKey}`);
  }, [failedChecksKey]);
  const founderOfferUnavailable = Boolean(userId) && (!founderHistoryKnown || hasFounderHistory);
  const returnResourceState = membershipReturnResourceState(returnResourceId, returnResourceRead);
  const returnResourceLoaded = returnResourceState.loaded;
  const returnResourceError = returnResourceState.error;
  const returnResourcePlanIds = returnResourceState.requiredPlanIds;
  const noSelectablePlanForResource = returnResourceId !== null
    && returnResourceLoaded
    && !returnResourceError
    && !membershipResourceHasSelectablePlan(returnResourcePlanIds);
  const selectedPlanId = resolveMembershipPlanSelection(
    selectedPlanPreference,
    returnResourcePlanIds,
    returnResourceId !== null,
    returnResourceLoaded,
    founderOfferUnavailable,
  );
  const selectedFounderChecksUnavailable = founderChecksBlockPlan(selectedPlanId, founderChecksUnavailable);
  const hasCurrentMembership = memberStatusLoaded && hasCurrentPaidMembership(entitlements, subscription);
  const currentPlanId = entitlements.planId !== "free"
    ? entitlements.planId
    : hasCurrentMembership && subscription
      ? subscription.planId
      : entitlements.planId;
  const effectiveReturnPlanIds: readonly string[] = (
    returnResourceId
      ? returnResourcePlanIds
      : requestedPlanId
        ? [requestedPlanId]
        : []
  );
  const effectiveReturnPlanKey = effectiveReturnPlanIds.join(",");
  const currentPlanUnlocksReturn = effectiveReturnPlanIds.length > 0
    && membershipPlanUnlocksResource(currentPlanId, effectiveReturnPlanIds);
  const requestedPlanMismatch = (requestedPlanId !== null || returnResourceId !== null)
    && hasCurrentMembership
    && currentPlanId !== selectedPlanId
    && !currentPlanUnlocksReturn;
  const hasUnlockedMembership = hasCurrentMembership
    && returnResourceLoaded
    && !returnResourceError
    && (returnResourceId
      ? membershipPlanUnlocksResource(entitlements.planId, returnResourcePlanIds)
      : entitlementSatisfiesRequestedPlan(entitlements, requestedPlanId));
  const canCreateApplication = memberStatusLoaded
    && schemaReadiness === "ready"
    && !memberStatusError
    && !applicationsError
    && !selectedFounderChecksUnavailable
    && !noSelectablePlanForResource
    && (selectedPlanId !== "founder" || founderHistoryKnown)
    && (!returnResourceId || (
      returnResourceLoaded
      && !returnResourceError
      && returnResourcePlanIds.includes(selectedPlanId)
    ))
    && canStartMembershipApplication(
      applications,
      entitlements,
      subscription,
      selectedPlanId,
      hasFounderHistory,
    );
  const currentMembershipPlanId = ["founder", "teacher"].includes(currentPlanId)
    ? currentPlanId as MembershipPlanId
    : null;
  const applicationPlanId: MembershipPlanId = hasOpenApplication && ["founder", "teacher"].includes(pendingApplication.planId)
    ? pendingApplication.planId as MembershipPlanId
    : hasCurrentMembership && !requestedPlanMismatch && currentMembershipPlanId
      ? currentMembershipPlanId
      : selectedPlanId;
  const applicationFounderChecksUnavailable = founderChecksBlockPlan(applicationPlanId, founderChecksUnavailable);
  const applicationFounderHistoryError = founderChecksBlockPlan(applicationPlanId, founderHistoryError);
  const pendingFounderChecksUnavailable = founderChecksBlockPlan(latestApplication?.planId, founderChecksUnavailable);
  const applicationAmount = applicationPlanId === "founder" ? 299 : 599;
  const pendingReference = pendingApplication?.referenceCode ?? null;
  // A different (or new) application starts from its own state: step 2 unless its
  // slip was sent. Adjusting state while rendering (not in an effect) avoids a
  // flash of the wrong step.
  if (stepScope !== pendingReference) {
    setStepScope(pendingReference);
    if (pendingReference) setSawPendingApplication(true);
    setRequestedStep(null);
    setSlipFeedback(null);
    setMessageCopied(false);
    setSlipMark(pendingReference ? { referenceCode: pendingReference, sent: readSlipSent(pendingReference) } : null);
  }
  const slipMarkReady = pendingReference === null || slipMark?.referenceCode === pendingReference;
  const slipSent = Boolean(pendingApplication?.lineSlipReceivedAt)
    || (slipMark?.referenceCode === pendingReference && slipMark.sent);
  const slipMessageInput = pendingApplication
    ? {
        planName: membershipApplicationPlanLabel(pendingApplication.planId),
        referenceCode: pendingApplication.referenceCode,
        amountThb: pendingApplication.quotedAmountThb,
      }
    : null;
  const slipMessage = slipMessageInput ? lineSlipMessage(slipMessageInput) : "";
  const slipAction = slipMessageInput ? lineSlipAction(process.env.NEXT_PUBLIC_LINE_OA_ID, slipMessageInput) : null;
  const selectedPlan = plans.find((plan) => plan.id === applicationPlanId) ?? null;
  const membershipNeedsRenewal = canRequestMembershipRenewal(subscription);
  const membershipStatusPlanId = subscription && (hasCurrentMembership || membershipNeedsRenewal)
    ? subscription.planId
    : currentPlanId;
  const currentMembershipPlanName = plans.find((plan) => plan.id === membershipStatusPlanId)?.name
    ?? planDisplayName(membershipStatusPlanId, subscription?.planName);
  const returnActionLabel = returnTarget.canAutoReturn ? "กลับไปเปิดสื่อ" : "ไปที่คลังสื่อ";
  const planChoices = plans.filter((plan): plan is Plan & { id: MembershipPlanId } => (
    (plan.id === "founder" || plan.id === "teacher")
    && (!returnResourceId || !returnResourceLoaded || returnResourcePlanIds.includes(plan.id))
  ));
  const canConvertPendingFounderToTeacher = !returnResourceId
    || (returnResourceLoaded && !returnResourceError && returnResourcePlanIds.includes("teacher"));
  const teacherRequestedForPendingFounder = selectedPlanId === "teacher"
    && latestApplication?.status === "pending"
    && latestApplication.planId === "founder"
    && canConvertPendingFounderToTeacher;
  const founderRenewalOrAlternativeCopy = canConvertPendingFounderToTeacher
    ? "กรุณาต่ออายุ 599 บาท/ปี หรือเลือก Teacher Pro"
    : "สื่อนี้รองรับเฉพาะสิทธิ์ Founder เดิม กรุณาใช้ขั้นตอนต่ออายุ 599 บาท/ปี";
  const pendingFounderUnavailable = latestApplication?.status === "pending"
    && latestApplication.planId === "founder"
    && (capacity?.isFull === true || hasFounderHistory);
  const pendingPlanMismatch = membershipApplicationPlanMismatch(
    pendingApplication?.planId,
    returnResourcePlanIds,
    returnResourceId !== null,
    returnResourceLoaded,
    returnResourceError,
  );
  const pendingResourceEligibilityUnknown = pendingApplication !== null
    && returnResourceId !== null
    && (!returnResourceLoaded || returnResourceError);
  const pendingPaymentBlocked = memberStatusError
    || applicationsError
    || pendingFounderChecksUnavailable
    || pendingFounderUnavailable
    || pendingPlanMismatch
    || pendingResourceEligibilityUnknown
    || noSelectablePlanForResource;
  const legacyReturnQuery = new URLSearchParams({ returnTo });
  const signInHref = `/login?next=${encodeURIComponent(`/membership?${legacyReturnQuery.toString()}`)}`;
  const signupHref = FREE_SIGNUP_HREF;
  // After signing in, come back to this page with the chosen plan (and where to go next).
  const wizardReturnQuery = new URLSearchParams({ plan: selectedPlanId, returnTo });
  const wizardSignInHref = `/login?next=${encodeURIComponent(`/membership?${wizardReturnQuery.toString()}`)}`;
  const wizardStep = resolveWizardStep({
    hasPendingApplication: hasOpenApplication,
    slipSent,
    paymentBlocked: pendingPaymentBlocked,
    requested: requestedStep,
  });

  const bodyMode = resolveMembershipBodyMode({
    supabaseConfigured: isSupabaseConfigured,
    schemaReadiness,
    authLoaded,
    signedIn: Boolean(userId),
    noSelectablePlanForResource,
    hasUnlockedMembership,
    hasOpenApplication: latestApplication !== null && hasOpenApplication,
    memberStatusError,
    activeMembershipStillSettling: hasCurrentMembership && !requestedPlanMismatch && !returnResourceError && !memberStatusError,
    readsFailed: memberStatusError || applicationsError || applicationFounderHistoryError || returnResourceError || applicationFounderChecksUnavailable,
  });
  const wizardMode = bodyMode === "signedOut" || bodyMode === "create" || (bodyMode === "pending" && slipMarkReady);
  const showStepper = wizardMode && shouldShowMembershipStepper({
    authLoaded,
    signedIn: Boolean(userId),
    memberStatusLoaded,
    membershipActive: hasCurrentMembership,
    hasPendingApplication: hasOpenApplication,
  });
  const stepperCurrent = bodyMode === "pending" ? wizardStep : 1;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const load = async () => {
      const [readiness, authResult, publicPlans, returnResourceResult] = await Promise.all([
        fetchMembershipSchemaReadiness(supabase),
        supabase.auth.getUser().catch(() => null),
        fetchPlans(supabase),
        returnResourceId
          ? fetchMembershipReturnResource(supabase, returnResourceId)
          : Promise.resolve({ requiredPlanIds: [] as string[], error: false }),
      ]);
      if (!active) return;
      setSchemaReadiness(readiness);
      setPlans(publicPlans);
      setReturnResourceRead(returnResourceId ? {
        resourceId: returnResourceId,
        requiredPlanIds: returnResourceResult.requiredPlanIds,
        error: returnResourceResult.error,
      } : null);
      const user = authResult
        && !authResult.error
        && isPermanentAuthUser(authResult.data.user)
        ? authResult.data.user
        : null;
      setUserId(user?.id ?? null);
      if (readiness !== "ready") {
        setCapacity(null);
        setCapacityLoaded(true);
        setApplications([]);
        setApplicationsError(false);
        setFounderHistory(false);
        setFounderHistoryLoaded(true);
        setFounderHistoryError(false);
        setEntitlements(EMPTY_ENTITLEMENTS);
        setSubscription(null);
        setMemberStatusError(false);
        setEntitlementsFailed(false);
        setSubscriptionFailed(false);
        setMemberStatusLoaded(true);
        setAuthLoaded(true);
        return;
      }
      const [founderCapacity, applicationResult, entitlementResult, subscriptionResult, founderHistoryResult] = await Promise.all([
        shouldLoadFounderChecks ? fetchFounderCapacity(supabase) : Promise.resolve(null),
        user ? fetchUpgradeRequestsResult(supabase, user.id) : Promise.resolve({ applications: [], error: false }),
        user ? fetchEntitlementsResult(supabase) : Promise.resolve({ entitlements: EMPTY_ENTITLEMENTS, error: false }),
        user ? fetchMemberSubscription(supabase, user.id) : Promise.resolve({ subscription: null, error: false }),
        user && shouldLoadFounderChecks
          ? fetchMyFounderHistory(supabase)
          : Promise.resolve({ hasFounderHistory: false, error: false }),
      ]);
      if (!active) return;
      setCapacity(founderCapacity);
      setCapacityLoaded(true);
      if (user) {
        setApplications(applicationResult.applications);
      }
      setApplicationsError(applicationResult.error);
      setFounderHistory(founderHistoryResult.hasFounderHistory);
      setFounderHistoryLoaded(true);
      setFounderHistoryError(founderHistoryResult.error);
      if (!entitlementResult.error) setEntitlements(entitlementResult.entitlements);
      if (!subscriptionResult.error) setSubscription(subscriptionResult.subscription);
      setMemberStatusError(entitlementResult.error || subscriptionResult.error);
      setEntitlementsFailed(entitlementResult.error);
      setSubscriptionFailed(subscriptionResult.error);
      setMemberStatusLoaded(true);
      setAuthLoaded(true);
    };
    void load();
    return () => { active = false; };
  }, [returnResourceId, shouldLoadFounderChecks, supabase]);

  useEffect(() => {
    if (!isSupabaseConfigured || schemaReadiness !== "ready") return;
    const runner = createLatestRefreshRunner(
      () => Promise.all([
        shouldLoadFounderChecks ? fetchFounderCapacity(supabase) : Promise.resolve(null),
        userId ? fetchUpgradeRequestsResult(supabase, userId) : Promise.resolve({ applications: [], error: false }),
        userId ? fetchEntitlementsResult(supabase) : Promise.resolve({ entitlements: EMPTY_ENTITLEMENTS, error: false }),
        userId ? fetchMemberSubscription(supabase, userId) : Promise.resolve({ subscription: null, error: false }),
        userId && shouldLoadFounderChecks
          ? fetchMyFounderHistory(supabase)
          : Promise.resolve({ hasFounderHistory: false, error: false }),
        returnResourceId
          ? fetchMembershipReturnResource(supabase, returnResourceId)
          : Promise.resolve({ requiredPlanIds: [] as string[], error: false }),
      ]),
      ([nextCapacity, applicationResult, entitlementResult, subscriptionResult, founderHistoryResult, returnResourceResult]) => {
        setCapacity(nextCapacity);
        if (!applicationResult.error) setApplications(applicationResult.applications);
        setApplicationsError(applicationResult.error);
        if (!founderHistoryResult.error) setFounderHistory(founderHistoryResult.hasFounderHistory);
        setFounderHistoryLoaded(true);
        setFounderHistoryError(founderHistoryResult.error);
        setReturnResourceRead(returnResourceId ? {
          resourceId: returnResourceId,
          requiredPlanIds: returnResourceResult.requiredPlanIds,
          error: returnResourceResult.error,
        } : null);
        if (!entitlementResult.error) setEntitlements(entitlementResult.entitlements);
        if (!subscriptionResult.error) setSubscription(subscriptionResult.subscription);
        setMemberStatusError(entitlementResult.error || subscriptionResult.error);
        setEntitlementsFailed(entitlementResult.error);
        setSubscriptionFailed(subscriptionResult.error);
        setMemberStatusLoaded(true);
      },
    );
    const refreshStatus = () => { void runner.request(); };
    const timer = window.setInterval(refreshStatus, 60_000);
    window.addEventListener("focus", refreshStatus);
    return () => {
      runner.dispose();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshStatus);
    };
  }, [returnResourceId, schemaReadiness, shouldLoadFounderChecks, supabase, userId]);

  useEffect(() => {
    if (!memberStatusLoaded || !returnResourceLoaded || returnResourceError) return;
    const requiredPlanIds = effectiveReturnPlanKey
      ? effectiveReturnPlanKey.split(",")
      : [];
    const destination = membershipAutoReturnDestination(
      requestedReturnTo,
      requiredPlanIds,
      entitlements,
      hasAutoReturned.current,
    );
    if (!destination) return;
    hasAutoReturned.current = true;
    router.replace(destination);
  }, [effectiveReturnPlanKey, entitlements, memberStatusLoaded, requestedReturnTo, returnResourceError, returnResourceLoaded, router]);

  const handleRetrySchemaReadiness = async () => {
    if (!isSupabaseConfigured || schemaReadiness === "checking") return;
    setSchemaReadiness("checking");
    setCapacityLoaded(false);
    setError(null);
    const readiness = await fetchMembershipSchemaReadiness(supabase);
    setSchemaReadiness(readiness);
    if (readiness !== "ready") {
      setCapacity(null);
      setCapacityLoaded(true);
      setApplications([]);
      setApplicationsError(false);
      setFounderHistory(false);
      setFounderHistoryLoaded(true);
      setFounderHistoryError(false);
      setEntitlements(EMPTY_ENTITLEMENTS);
      setSubscription(null);
      setMemberStatusError(false);
      setEntitlementsFailed(false);
      setSubscriptionFailed(false);
      setMemberStatusLoaded(true);
      return;
    }
    const [nextCapacity, applicationResult, entitlementResult, subscriptionResult, founderHistoryResult, returnResourceResult] = await Promise.all([
      shouldLoadFounderChecks ? fetchFounderCapacity(supabase) : Promise.resolve(null),
      userId ? fetchUpgradeRequestsResult(supabase, userId) : Promise.resolve({ applications: [], error: false }),
      userId ? fetchEntitlementsResult(supabase) : Promise.resolve({ entitlements: EMPTY_ENTITLEMENTS, error: false }),
      userId ? fetchMemberSubscription(supabase, userId) : Promise.resolve({ subscription: null, error: false }),
      userId && shouldLoadFounderChecks
        ? fetchMyFounderHistory(supabase)
        : Promise.resolve({ hasFounderHistory: false, error: false }),
      returnResourceId
        ? fetchMembershipReturnResource(supabase, returnResourceId)
        : Promise.resolve({ requiredPlanIds: [] as string[], error: false }),
    ]);
    setCapacity(nextCapacity);
    setCapacityLoaded(true);
    if (!applicationResult.error) setApplications(applicationResult.applications);
    setApplicationsError(applicationResult.error);
    if (!founderHistoryResult.error) setFounderHistory(founderHistoryResult.hasFounderHistory);
    setFounderHistoryLoaded(true);
    setFounderHistoryError(founderHistoryResult.error);
    setReturnResourceRead(returnResourceId ? {
      resourceId: returnResourceId,
      requiredPlanIds: returnResourceResult.requiredPlanIds,
      error: returnResourceResult.error,
    } : null);
    if (!entitlementResult.error) setEntitlements(entitlementResult.entitlements);
    if (!subscriptionResult.error) setSubscription(subscriptionResult.subscription);
    setMemberStatusError(entitlementResult.error || subscriptionResult.error);
    setEntitlementsFailed(entitlementResult.error);
    setSubscriptionFailed(subscriptionResult.error);
    setMemberStatusLoaded(true);
  };

  const selectPlan = (planId: MembershipPlanId) => {
    if (hasOpenApplication || (hasCurrentMembership && !requestedPlanMismatch)) return;
    if (schemaReadiness !== "ready" || memberStatusError || applicationsError) return;
    const founderChecksDeferred = planId === "founder" && !shouldLoadFounderChecks;
    if (founderChecksBlockPlanSelection(planId, founderChecksUnavailable, founderChecksDeferred)) return;
    if (returnResourceId && (!returnResourceLoaded || !returnResourcePlanIds.includes(planId))) return;
    if (planId === "founder" && founderOfferUnavailable) return;
    setSelectedPlanPreference(planId);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("plan", planId);
    window.history.replaceState(window.history.state, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  };

  const handleCreateApplication = async () => {
    if (!userId || submitting) return;
    if (schemaReadiness !== "ready") {
      setError(MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE);
      return;
    }
    if (applicationFounderChecksUnavailable) {
      setError("ยังตรวจสอบประวัติ Founder หรือจำนวนสิทธิ์ไม่ได้ จึงยังไม่รับใบสมัครหรือการชำระ กรุณาลองตรวจสอบอีกครั้ง");
      return;
    }
    if (!canCreateApplication) {
      setError(memberStatusError || applicationsError || applicationFounderHistoryError
        ? "ยังตรวจสอบสถานะสมาชิกไม่ได้ จึงปิดการส่งใบสมัครซ้ำชั่วคราว กรุณาลองใหม่"
        : hasOpenApplication
          ? "มีใบสมัครที่รอดำเนินการอยู่แล้ว กรุณาใช้เลขอ้างอิงเดิม"
          : applicationPlanId === "founder" && hasFounderHistory
            ? `บัญชีนี้เคยได้รับสิทธิ์ Founder ปีแรก 299 บาทแล้ว ${founderRenewalOrAlternativeCopy}`
          : "บัญชีนี้มีสิทธิ์สมาชิกที่ใช้งานอยู่แล้ว ไม่จำเป็นต้องส่งใบสมัครซ้ำ");
      return;
    }
    if (applicationPlanId === "founder" && !capacity) {
      setError("ยังตรวจสอบจำนวนสิทธิ์ Founder ไม่ได้ จึงปิดการส่งใบสมัครชั่วคราว");
      return;
    }
    if (applicationPlanId === "founder" && capacity?.isFull) {
      setError(canConvertPendingFounderToTeacher
        ? "สิทธิ์ Founder ครบแล้ว กรุณาเลือกแพ็ก Teacher Pro 599 บาท/ปี"
        : "สิทธิ์ Founder ครบแล้ว และ Teacher Pro ไม่สามารถเปิดสื่อรายการนี้ได้");
      return;
    }
    const planChangeConfirmation = membershipPlanChangeConfirmation(subscription, applicationPlanId);
    if (planChangeConfirmation && !window.confirm(planChangeConfirmation)) return;
    setSubmitting(true);
    setError(null);
    trackEvent("checkout_start", { plan_id: applicationPlanId, source: "membership" });
    const result = await createMembershipApplication(supabase, applicationPlanId);
    setSubmitting(false);
    if (!result.application) {
      // Another tab may have created the one allowed pending application
      // while this tab was open. Re-read before showing an error so the UI
      // displays that original reference instead of inviting a duplicate.
      const [applicationResult, nextCapacity] = await Promise.all([
        fetchUpgradeRequestsResult(supabase, userId),
        applicationPlanId === "founder" ? fetchFounderCapacity(supabase) : Promise.resolve(capacity),
      ]);
      if (!applicationResult.error) setApplications(applicationResult.applications);
      setApplicationsError(applicationResult.error);
      if (applicationPlanId === "founder") setCapacity(nextCapacity);
      setError(applicationResult.error
        ? "ยังตรวจสอบใบสมัครล่าสุดไม่ได้ กรุณาอย่าส่งซ้ำและลองใหม่"
        : applicationResult.applications.some((application) => application.status === "pending")
        ? null
        : /Founder first-year offer cannot be claimed twice/i.test(result.error ?? "")
          ? `บัญชีนี้เคยได้รับสิทธิ์ Founder ปีแรกแล้ว ${founderRenewalOrAlternativeCopy}`
          : membershipDisplayError(result.error, "ส่งใบสมัครไม่สำเร็จ กรุณาลองอีกครั้ง"));
      return;
    }
    const application = result.application;
    setFocusStepHeading(true);
    setApplications((current) => [application, ...current.filter((item) => item.id !== application.id)]);
    setApplicationsError(false);
    if (applicationPlanId === "founder") setCapacity(await fetchFounderCapacity(supabase));
  };

  const handleConvertToTeacher = async () => {
    if (!latestApplication || latestApplication.status !== "pending" || latestApplication.planId !== "founder" || converting) return;
    if (applicationsError) {
      setError("ยังตรวจสอบใบสมัครล่าสุดไม่ได้ จึงปิดการเปลี่ยนแพ็กชั่วคราว");
      return;
    }
    if (!canConvertPendingFounderToTeacher) {
      setError("สื่อนี้ไม่รองรับแพ็ก Teacher Pro จึงไม่สามารถเปลี่ยนใบสมัครเป็น Teacher Pro เพื่อปลดล็อกรายการนี้");
      return;
    }
    if (schemaReadiness !== "ready") {
      setError(MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE);
      return;
    }
    if (!window.confirm(founderApplicationConversionConfirmation(subscription))) return;
    setConverting(true);
    setError(null);
    const result = await convertFounderApplicationToTeacher(supabase, latestApplication.id);
    if (result.error || !result.application) {
      setError(`เปลี่ยนแพ็กไม่สำเร็จ: ${membershipDisplayError(result.error, "ระบบไม่ได้ส่งข้อมูลใบสมัครกลับมา")}`);
    } else if (userId) {
      const application = result.application;
      setSelectedPlanPreference("teacher");
      setApplications((current) => [application, ...current.filter((item) => item.id !== application.id)]);
    }
    setConverting(false);
  };

  const handleCopyReference = async (referenceCode: string) => {
    setError(null);
    try {
      await navigator.clipboard.writeText(referenceCode);
      setCopied(referenceCode);
      window.setTimeout(() => setCopied((current) => current === referenceCode ? null : current), 2500);
    } catch {
      setError("คัดลอกเลขอ้างอิงไม่สำเร็จ กรุณาแตะค้างที่เลขแล้วคัดลอกด้วยตนเอง");
    }
  };

  const goToStep = (step: WizardStep) => {
    setError(null);
    setRequestedStep(step);
    setFocusStepHeading(true);
  };

  // "ส่งสลิปแล้ว": remember it for this reference in this browser (no database write).
  const handleSlipSent = () => {
    if (!pendingApplication) return;
    writeSlipSent(pendingApplication.referenceCode, true);
    setSlipMark({ referenceCode: pendingApplication.referenceCode, sent: true });
    goToStep(4);
  };

  const handleBackToSlip = () => {
    if (!pendingApplication) return;
    writeSlipSent(pendingApplication.referenceCode, false);
    setSlipMark({ referenceCode: pendingApplication.referenceCode, sent: false });
    goToStep(3);
  };

  const MESSAGE_NOT_COPIED = "คัดลอกข้อความอัตโนมัติไม่สำเร็จ กดปุ่ม “คัดลอกข้อความ” แล้ววางในแชตพร้อมแนบสลิป";

  const handleCopySlipMessage = async () => {
    try {
      await navigator.clipboard.writeText(slipMessage);
      setMessageCopied(true);
      setSlipFeedback("คัดลอกข้อความแล้ว วางในแชตแล้วแนบสลิป");
      window.setTimeout(() => setMessageCopied(false), 2500);
    } catch {
      setSlipFeedback(MESSAGE_NOT_COPIED);
    }
  };

  // Payment is sent by LINE, so opening it is the step this site can see; whether
  // the slip was sent is only known to staff. With no LINE OA ID configured the
  // message cannot be pre-filled, so it is copied first and the member pastes it.
  const handleOpenLine = () => {
    if (!pendingApplication || !slipAction) return;
    setError(null);
    trackEvent("payment_submit", { plan_id: pendingApplication.planId, stage: "line_opened" });
    if (!slipAction.copyFirst) {
      setSlipFeedback("กำลังเปิด LINE — ข้อความถูกเตรียมไว้ในแชตแล้ว แนบสลิปแล้วกดส่ง");
      return;
    }
    setSlipFeedback("กำลังเปิด LINE…");
    try {
      const write = navigator.clipboard?.writeText(slipMessage);
      if (!write) {
        setSlipFeedback(MESSAGE_NOT_COPIED);
        return;
      }
      void write.then(
        () => setSlipFeedback("คัดลอกข้อความแล้ว วางในแชตแล้วแนบสลิป"),
        () => setSlipFeedback(MESSAGE_NOT_COPIED),
      );
    } catch {
      setSlipFeedback(MESSAGE_NOT_COPIED);
    }
  };

  const pendingBlockedBox = pendingPaymentBlocked && latestApplication ? (

        <div role="alert" className="kru-membership-conversion">
          <strong>
            {memberStatusError
              ? "ยังตรวจสอบสิทธิ์สมาชิกไม่ได้"
              : applicationsError
              ? "ยังตรวจสอบใบสมัครล่าสุดไม่ได้"
              : pendingFounderChecksUnavailable
              ? "ยังตรวจสอบประวัติ Founder หรือจำนวนสิทธิ์ไม่ได้"
              : pendingResourceEligibilityUnknown
              ? "กำลังตรวจสอบแพ็กที่ใช้เปิดสื่อนี้"
              : pendingPlanMismatch
                ? `ใบสมัคร ${membershipApplicationPlanLabel(latestApplication.planId)} นี้ไม่สามารถเปิดสื่อที่เลือกได้`
                : noSelectablePlanForResource
                  ? "สื่อนี้ไม่มีแพ็กที่เปิดจำหน่ายรองรับ"
                : hasFounderHistory
                  ? "บัญชีนี้ใช้สิทธิ์ Founder ปีแรกแล้ว"
                  : "Founder ครบ 100 สิทธิ์ก่อนการยืนยันยอด"}
          </strong>
          {memberStatusError ? (
            <>
              <p>ระบบปิดปุ่ม LINE การแจ้งชำระ และการเปลี่ยนแพ็กไว้จนกว่าจะตรวจสอบสิทธิ์สมาชิกสำเร็จ</p>
              <Button type="button" variant="secondary" onClick={() => void handleRetrySchemaReadiness()}>ลองตรวจสอบอีกครั้ง</Button>
            </>
          ) : applicationsError ? (
            <>
              <p>ระบบปิดปุ่ม LINE การแจ้งชำระ และการเปลี่ยนแพ็กเพื่อไม่ให้ใช้รายการเก่าที่อาจมีสถานะเปลี่ยนไปแล้ว</p>
              <Button type="button" variant="secondary" onClick={() => void handleRetrySchemaReadiness()}>ลองตรวจสอบอีกครั้ง</Button>
            </>
          ) : pendingFounderChecksUnavailable ? (
            <>
              <p>ระบบปิดปุ่ม LINE และการแจ้งชำระสำหรับใบสมัคร Founder ไว้จนกว่าจะตรวจสอบข้อมูลสำเร็จ</p>
              {teacherRequestedForPendingFounder && (
                <Button size="lg" block loading={converting} onClick={() => void handleConvertToTeacher()}>
                  ยืนยันเปลี่ยนเป็น Teacher Pro 599 บาท/ปี
                </Button>
              )}
              {!teacherRequestedForPendingFounder && (
                <Button type="button" variant="secondary" onClick={() => void handleRetrySchemaReadiness()}>ลองตรวจสอบอีกครั้ง</Button>
              )}
            </>
          ) : pendingResourceEligibilityUnknown ? (
            <p>ระบบปิดการแจ้งชำระไว้จนกว่าจะตรวจสอบสิทธิ์ของสื่อสำเร็จ กรุณาลองใหม่อีกครั้ง</p>
          ) : noSelectablePlanForResource ? (
            <p>ระบบปิดปุ่ม LINE การแจ้งชำระ และการเปลี่ยนแพ็ก เพราะไม่มีแพ็กที่เปิดจำหน่ายใดเปิดสื่อนี้ได้</p>
          ) : latestApplication.planId === "founder" && canConvertPendingFounderToTeacher ? (
            <>
              <p>ใบสมัคร Founder นี้ไม่สามารถส่งต่อเพื่อยืนยันได้ เปลี่ยนเป็น Teacher Pro 599 บาท/ปีโดยใช้เลขอ้างอิงเดิมได้</p>
              <Button size="lg" block loading={converting} onClick={() => void handleConvertToTeacher()}>
                ยืนยันเปลี่ยนเป็น Teacher Pro 599 บาท/ปี
              </Button>
            </>
          ) : pendingPlanMismatch ? (
            <p>ระบบปิดการแจ้งชำระเพื่อป้องกันการชำระแพ็กที่เปิดสื่อนี้ไม่ได้ กรุณาติดต่อทีมงานเพื่อจัดการใบสมัครเดิมก่อนเลือกแพ็กที่รองรับ</p>
          ) : (
            <p>สื่อที่ต้องการรองรับเฉพาะ Founder จึงไม่เสนอให้เปลี่ยนเป็น Teacher Pro ซึ่งจะเปิดสื่อนี้ไม่ได้ กรุณาใช้ขั้นตอนต่ออายุ 599 บาท/ปีหากมีสิทธิ์ Founder เดิม</p>
          )}
        </div>
  ) : null;

  return (
    <div className="kru-membership-page">
      <header className="kru-membership-header">
        <Link href="/" className="kru-membership-brand" aria-label="กลับหน้าแรก KruAorry">
          <Mascot size={36} />
          <strong>KruAorry</strong>
        </Link>
        <nav aria-label="เมนูสมาชิก">
          <Link href="/" className="kru-btn kru-btn--ghost"><Home size={17} aria-hidden="true" /> หน้าแรก</Link>
          <Link href={returnTo} className="kru-btn kru-btn--ghost"><ArrowLeft size={17} aria-hidden="true" /> กลับไปดูสื่อ</Link>
          {authLoaded && userId ? (
            <Link href="/app" className="kru-btn kru-btn--soft">พื้นที่สมาชิก</Link>
          ) : noSelectablePlanForResource ? (
            <Link href={signInHref} className="kru-btn kru-btn--soft">เข้าสู่ระบบตรวจสอบสิทธิ์</Link>
          ) : (
            <Link href={signupHref} className="kru-btn kru-btn--soft">เข้าสู่ระบบ / สมัครบัญชี</Link>
          )}
        </nav>
      </header>

      <main>
        {showStepper && <MembershipStepper current={stepperCurrent} />}
        {bodyMode === "pending" || bodyMode === "approved" ? (
          bodyMode === "pending" ? (
            <p className="kru-membership-planbar"><Sparkles size={16} aria-hidden="true" /> {membershipApplicationPlanLabel(applicationPlanId)} · {selectedPlan?.priceLabel ?? (applicationPlanId === "founder" ? "299 บาทเฉพาะปีแรก" : "599 บาท/ปี")}</p>
          ) : null
        ) : (
          <section className="kru-membership-hero">
            <div className="kru-membership-hero__copy">
              <span className="kru-membership-eyebrow"><Sparkles size={16} aria-hidden="true" /> {noSelectablePlanForResource ? "สิทธิ์เฉพาะสมาชิกเดิม" : applicationPlanId === "founder" ? "สิทธิ์เปิดตัว Founder 100" : "แพ็ก Teacher Pro"}</span>
              <h1>{noSelectablePlanForResource ? "แพ็กสำหรับสื่อนี้ยังไม่เปิดรับสมัคร" : selectedPlan?.priceLabel ?? (applicationPlanId === "founder" ? "299 บาทเฉพาะปีแรก" : "599 บาท/ปี")}</h1>
              <p className="kru-membership-hero__lead">
                {noSelectablePlanForResource
                  ? "สื่อนี้ใช้สิทธิ์แพ็กเดิมหรือแพ็กเฉพาะที่ไม่มีจำหน่ายในหน้าสมัครสมาชิกปัจจุบัน"
                  : applicationPlanId === "founder"
                  ? "สำหรับ 100 คนแรกที่ครูอรรี่ยืนยันการชำระเงินจริง"
                  : "แพ็กสมาชิกรายปีสำหรับครู เปิดใช้สื่อและไฟล์ Teacher Pro ได้ครบ"}
              </p>
              <div className="kru-membership-renewal"><ShieldCheck size={20} aria-hidden="true" /><strong>{noSelectablePlanForResource ? "เข้าสู่ระบบด้วยบัญชีเดิมเพื่อตรวจสอบสิทธิ์" : applicationPlanId === "founder" ? "ต่ออายุปีถัดไป 599 บาท/ปี" : "ต่ออายุ 599 บาท/ปี"}</strong></div>
              <p className="kru-membership-rule">{noSelectablePlanForResource ? "ระบบจะไม่รับใบสมัครหรือการแจ้งชำระสำหรับแพ็กอื่นที่ไม่สามารถเปิดสื่อนี้ได้" : "การสร้างเลขอ้างอิงยังไม่นับสิทธิ์และยังไม่จองสิทธิ์ ต้องรอทีมงานตรวจและยืนยันยอดเงินเข้าจริง"}</p>
            </div>

            {noSelectablePlanForResource ? (
              <aside className="kru-membership-capacity" aria-live="polite">
                <span>สิทธิ์ของสื่อรายการนี้</span>
                <strong>ใช้สิทธิ์สมาชิกเดิม</strong>
                <p>เข้าสู่ระบบเพื่อตรวจสอบสิทธิ์ Plus, Lifetime หรือสิทธิ์เฉพาะที่เคยได้รับ</p>
              </aside>
            ) : applicationPlanId === "founder" ? (
              <aside className="kru-membership-capacity" aria-live="polite" aria-busy={!capacityLoaded}>
                <span>สิทธิ์ราคาเปิดตัว Founder</span>
                {schemaReadiness === "unavailable" ? (
                  <strong>ระบบสมัครสมาชิกกำลังปรับปรุงชั่วคราว</strong>
                ) : capacity ? (
                  <strong>{founderPublicNotice(capacity)}</strong>
                ) : (
                  <strong>{schemaReadiness === "checking" || !capacityLoaded ? "กำลังตรวจสอบความพร้อมของระบบ…" : "ตรวจสอบจำนวนสิทธิ์ไม่ได้ในขณะนี้"}</strong>
                )}
              </aside>
            ) : (
              <aside className="kru-membership-capacity kru-membership-capacity--plain" aria-live="polite">
                <span>แพ็กสมาชิกรายปี</span>
                <strong>Teacher Pro</strong>
                <p>599 บาท/ปี</p>
              </aside>
            )}
          </section>
        )}

        <section className="kru-card kru-membership-wizard" aria-busy={bodyMode === "pending" && !slipMarkReady}>
          {bodyMode === "approved" ? (
            <ApprovedPanel
              planName={currentMembershipPlanName}
              celebrate={sawPendingApplication}
              periodEnd={subscription?.currentPeriodEnd ?? null}
              href={returnTo}
              actionLabel={returnActionLabel}
            />
          ) : bodyMode === "pending" && latestApplication && !slipMarkReady ? (
            <p role="status" className="kru-membership-alert">กำลังตรวจสอบสถานะใบสมัคร…</p>
          ) : bodyMode === "pending" && latestApplication && wizardStep === 2 ? (
            <TransferStep
              application={latestApplication}
              referenceCopied={copied === latestApplication.referenceCode}
              legacyReportedAt={latestApplication.lineSlipReceivedAt ? null : latestApplication.paymentReportedAt}
              onCopyReference={(referenceCode) => void handleCopyReference(referenceCode)}
              onBack={() => goToStep(1)}
              onNext={() => goToStep(3)}
              focusHeading={focusStepHeading}
            />
          ) : bodyMode === "pending" && latestApplication && wizardStep === 3 ? (
            <SlipStep
              message={slipMessage}
              href={slipAction?.href ?? ""}
              copyFirst={slipAction?.copyFirst ?? false}
              feedback={slipFeedback}
              messageCopied={messageCopied}
              onOpenLine={handleOpenLine}
              onCopyMessage={() => void handleCopySlipMessage()}
              onSent={handleSlipSent}
              onBack={() => goToStep(2)}
              focusHeading={focusStepHeading}
            />
          ) : bodyMode === "pending" && latestApplication && wizardStep === 4 ? (
            <WaitingStep
              referenceCode={latestApplication.referenceCode}
              referenceCopied={copied === latestApplication.referenceCode}
              slipReceivedAt={latestApplication.lineSlipReceivedAt}
              legacyReportedAt={latestApplication.lineSlipReceivedAt ? null : latestApplication.paymentReportedAt}
              onCopyReference={(referenceCode) => void handleCopyReference(referenceCode)}
              onBackToSlip={handleBackToSlip}
              focusHeading={focusStepHeading}
            />
          ) : (
            <StepFrame
              title={noSelectablePlanForResource ? "ตรวจสอบสิทธิ์สมาชิกเดิม" : "กรอกใบสมัคร"}
              lead={bodyMode === "pending" ? "สร้างใบสมัครแล้ว" : noSelectablePlanForResource ? "ระบบจะตรวจสิทธิ์จากบัญชีเดิมโดยไม่สร้างใบสมัครแพ็กใหม่ที่เปิดสื่อนี้ไม่ได้" : "ระบบจะสร้างเลขอ้างอิงที่ใช้จับคู่บัญชีเว็บไซต์กับหลักฐานการชำระใน LINE"}
              focusHeading={focusStepHeading}
            >
              {userId && memberStatusLoaded && (hasCurrentMembership || membershipNeedsRenewal) && (
                <section className="kru-membership-current" aria-live="polite">
                  <div>
                    <Badge tone={membershipNeedsRenewal ? "warning" : "success"}>
                      {membershipNeedsRenewal ? "ต้องต่ออายุสมาชิก" : "สิทธิ์สมาชิกใช้งานอยู่"}
                    </Badge>
                    <strong>แพ็กปัจจุบัน: {currentMembershipPlanName}</strong>
                    {subscription?.currentPeriodEnd && (
                      <span>สิ้นสุดรอบสมาชิก {formatThaiDate(subscription.currentPeriodEnd)}</span>
                    )}
                  </div>
                  <div className="kru-membership-current__actions">
                    {hasUnlockedMembership && (
                      <Link className="kru-btn kru-btn--primary" href={returnTo}>{returnActionLabel}</Link>
                    )}
                    {membershipNeedsRenewal && !noSelectablePlanForResource && schemaReadiness === "ready" && !applicationsError && !founderChecksBlockPlan(membershipStatusPlanId, founderChecksUnavailable) && (
                      <a className="kru-btn kru-btn--soft" href={LINE_OA_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                        <MessageCircle size={17} aria-hidden="true" /> ขอเลขอ้างอิงต่ออายุ
                      </a>
                    )}
                  </div>
                </section>
              )}

              {bodyMode === "pending" && latestApplication ? (
                <div className="kru-membership-action-block">
                  <div className="kru-membership-summary">
                    <span>แพ็ก {membershipApplicationPlanLabel(latestApplication.planId)}</span>
                    <strong>{latestApplication.quotedAmountThb.toLocaleString("th-TH")} บาท</strong>
                    <small>เลขอ้างอิง {latestApplication.referenceCode}</small>
                  </div>
                  {pendingPaymentBlocked ? pendingBlockedBox : (
                    <Button type="button" size="lg" block onClick={() => goToStep(2)}>ไปขั้นที่ 2: โอนเงิน</Button>
                  )}
                </div>
              ) : (
                <>
                  <section className="kru-membership-plan" aria-labelledby="membership-plan-title">
                    <div className="kru-membership-plan__heading">
                      <h3 id="membership-plan-title">{noSelectablePlanForResource ? "สิทธิ์ที่ใช้เปิดสื่อ" : "แพ็กที่ต้องการสมัคร"}</h3>
                      {noSelectablePlanForResource ? (
                        <Badge tone="neutral">ไม่มีแพ็กที่เปิดขายสำหรับสื่อนี้</Badge>
                      ) : hasOpenApplication ? (
                        <Badge tone="neutral">ยึดตามใบสมัครที่รอดำเนินการ</Badge>
                      ) : hasCurrentMembership && !requestedPlanMismatch ? (
                        <Badge tone="success">แพ็กปัจจุบัน</Badge>
                      ) : requestedPlanMismatch ? (
                        <Badge tone="info">เปลี่ยนแพ็กเพื่อปลดล็อก</Badge>
                      ) : null}
                    </div>
                    {planChoices.length > 0 && (
                      <div className="kru-membership-plan__choices" role="group" aria-label="เลือกแพ็กสมาชิก">
                        {planChoices.map((plan) => {
                          const active = applicationPlanId === plan.id;
                          const founderChecksDeferred = plan.id === "founder" && !shouldLoadFounderChecks;
                          const founderUnavailable = plan.id === "founder" && (
                            founderChecksBlockPlanSelection(plan.id, founderChecksUnavailable, founderChecksDeferred)
                            || ((capacity?.isFull === true || founderOfferUnavailable)
                              && !hasOpenApplication
                              && currentPlanId !== "founder")
                          );
                          const unavailable = schemaReadiness !== "ready" || memberStatusError || applicationsError || founderUnavailable;
                          return (
                            <button
                              key={plan.id}
                              type="button"
                              className={active ? "is-active" : ""}
                              aria-pressed={active}
                              disabled={hasOpenApplication || (hasCurrentMembership && !requestedPlanMismatch) || unavailable}
                              onClick={() => selectPlan(plan.id)}
                            >
                              <strong>{plan.name}</strong>
                              <span>{plan.priceLabel}</span>
                              {unavailable && (
                                <small>{schemaReadiness !== "ready" || memberStatusError || applicationsError || (plan.id === "founder" && founderChecksUnavailable) ? planCheckLabel(checksLoading) : hasFounderHistory ? "ใช้สิทธิ์ปีแรกแล้ว" : "ครบ 100 สิทธิ์แล้ว"}</small>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {checksLoading && schemaReadiness !== "unavailable" && (
                      <p role="status" className="kru-membership-alert">กำลังตรวจสอบสิทธิ์ของบัญชี…</p>
                    )}
                    {failedChecks.length > 0 && schemaReadiness === "ready" && (
                      <div role="alert" className="kru-membership-alert kru-membership-alert--warning" style={{ display: "grid", gap: "var(--sp-3)" }}>
                        <strong>{failedMembershipChecksMessage(failedChecks)}</strong>
                        <span>
                          {onlyFounderChecksFailed(failedChecks)
                            ? "ยังเลือก Teacher Pro ได้ตามปกติ ส่วน Founder ต้องตรวจสอบให้สำเร็จก่อน"
                            : "เกิดจากการเชื่อมต่อไม่สำเร็จ ไม่ได้แปลว่าสิทธิ์ของคุณหายไป ระบบยังไม่แก้ไขข้อมูลใด ๆ"}
                        </span>
                        <Button type="button" variant="secondary" onClick={() => void handleRetrySchemaReadiness()}>ลองอีกครั้ง</Button>
                      </div>
                    )}
                    {selectedPlan && !noSelectablePlanForResource && (
                      <div className="kru-membership-plan__details">
                        {selectedPlan.note && <p>{selectedPlan.note}</p>}
                        <PlanBenefits benefits={selectedPlan.benefits ?? []} />
                      </div>
                    )}
                  </section>

                  {bodyMode === "unconfigured" ? (
                    <p role="status" className="kru-membership-alert kru-membership-alert--warning">ระบบสมาชิกยังไม่พร้อมใช้งาน กรุณากลับมาใหม่ภายหลัง</p>
                  ) : bodyMode === "checking" ? (
                    <p role="status" className="kru-membership-alert">กำลังตรวจสอบความพร้อมของระบบสมัครสมาชิก…</p>
                  ) : bodyMode === "unavailable" ? (
                    <div className="kru-membership-action-block">
                      <p role="alert" className="kru-membership-alert kru-membership-alert--warning">{MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE}</p>
                      <Button type="button" variant="secondary" onClick={() => void handleRetrySchemaReadiness()}>ลองตรวจสอบอีกครั้ง</Button>
                    </div>
                  ) : bodyMode === "authLoading" ? (
                    <p role="status" className="kru-membership-alert">กำลังตรวจสอบบัญชีสมาชิก…</p>
                  ) : bodyMode === "legacySignIn" ? (
                    <div className="kru-membership-action-block">
                      <p>สื่อนี้ไม่มีแพ็กที่เปิดจำหน่ายซึ่งใช้ปลดล็อกได้ เข้าสู่ระบบด้วยบัญชีสมาชิกเดิมเพื่อตรวจสอบสิทธิ์ Plus, Lifetime หรือสิทธิ์เฉพาะของคุณ</p>
                      <Link href={signInHref} className="kru-btn kru-btn--primary kru-btn--lg kru-btn--block">เข้าสู่ระบบเพื่อตรวจสอบสิทธิ์เดิม</Link>
                    </div>
                  ) : bodyMode === "signedOut" ? (
                    <div className="kru-membership-action-block">
                      <Link href={wizardSignInHref} className="kru-btn kru-btn--primary kru-btn--lg kru-btn--block">เข้าสู่ระบบเพื่อสมัคร</Link>
                      <p className="kru-membership-hint">เข้าสู่ระบบแล้วจะกลับมาที่หน้านี้ ยังไม่มีบัญชี? <Link href={signupHref}>สมัครบัญชีฟรีก่อน</Link> แล้วกลับมาเลือกแพ็กที่หน้านี้</p>
                    </div>
                  ) : bodyMode === "legacyNote" ? (
                    <p role="status" className="kru-membership-alert kru-membership-alert--warning">
                      สื่อนี้ไม่มีแพ็กที่เปิดจำหน่ายซึ่งใช้ปลดล็อกได้ ระบบจึงไม่แสดงปุ่มสมัครหรือ LINE สำหรับรายการนี้ กรุณาตรวจสอบด้วยบัญชีที่มีสิทธิ์เดิม
                    </p>
                  ) : bodyMode === "updating" ? (
                    <p role="status" className="kru-membership-alert">ระบบอนุมัติแพ็ก {currentMembershipPlanName} แล้ว กำลังอัปเดตสิทธิ์เปิดสื่อให้บัญชีนี้…</p>
                  ) : bodyMode === "errors" ? (
                    <div className="kru-membership-action-block">
                      <p role="alert" className="kru-membership-alert kru-membership-alert--warning">
                        {applicationFounderHistoryError || applicationFounderChecksUnavailable
                          ? "ยังตรวจสอบประวัติ Founder หรือจำนวนสิทธิ์ไม่ได้ ระบบจึงปิดใบสมัคร การเปลี่ยนแพ็ก และการชำระไว้ชั่วคราว"
                          : "ยังตรวจสอบสถานะสมาชิกหรือใบสมัครล่าสุดไม่ได้ ระบบจึงปิดการดำเนินการไว้ชั่วคราว"}
                      </p>
                      <Button type="button" variant="secondary" onClick={() => void handleRetrySchemaReadiness()}>ลองตรวจสอบอีกครั้ง</Button>
                    </div>
                  ) : (
                    <div className="kru-membership-action-block">
                      {applicationPlanId === "founder" && (capacity?.isFull || hasFounderHistory) ? (
                        <>
                          <p className="kru-membership-alert kru-membership-alert--warning">
                            {hasFounderHistory
                              ? `สิทธิ์ Founder 299 บาทใช้ได้เฉพาะปีแรกและครั้งแรกเท่านั้น ${founderRenewalOrAlternativeCopy}`
                              : canConvertPendingFounderToTeacher
                                ? "Founder ครบ 100 สิทธิ์แล้ว กรุณาเลือก Teacher Pro เพื่อสร้างใบสมัครใหม่"
                                : "Founder ครบ 100 สิทธิ์แล้ว และ Teacher Pro ไม่สามารถเปิดสื่อรายการนี้ได้"}
                          </p>
                          {(!returnResourceId || returnResourcePlanIds.includes("teacher")) && (
                            <Button size="lg" block onClick={() => selectPlan("teacher")}>เลือก Teacher Pro 599 บาท/ปี</Button>
                          )}
                        </>
                      ) : (
                        <>
                          <p>{applicationPlanId === "founder" ? "ระบบจะสร้างเลขอ้างอิงสำหรับสิทธิ์ปีแรก 299 บาท" : "ระบบจะสร้างเลขอ้างอิงสำหรับแพ็ก Teacher Pro 599 บาท/ปี"}</p>
                          <Button size="lg" block loading={submitting} onClick={() => void handleCreateApplication()}>
                            {submitting ? "กำลังสร้างเลขอ้างอิง…" : `สร้างเลขอ้างอิง ${applicationAmount.toLocaleString("th-TH")} บาท`}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </StepFrame>
          )}

          {error && <p role="alert" className="kru-membership-alert kru-membership-alert--danger">{error}</p>}
        </section>

        {userId ? <ApplicationHistory applications={applications} /> : null}
      </main>

      <footer>
        <span>KruAorry — ระบบสมาชิกสำหรับครูไทย</span>
        <span><Link href="/terms">เงื่อนไขการใช้งาน</Link> · <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link></span>
      </footer>

      <style jsx>{`
        .kru-membership-page { min-height: 100vh; background: var(--surface-page); }
        .kru-membership-header { position: sticky; top: 0; z-index: 20; min-height: 68px; padding: var(--sp-4) max(var(--sp-5), env(safe-area-inset-right)) var(--sp-4) max(var(--sp-5), env(safe-area-inset-left)); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); border-bottom: 1px solid var(--border-subtle); background: rgba(255,255,255,.94); backdrop-filter: blur(14px); }
        .kru-membership-brand { min-width: 0; display: inline-flex; align-items: center; gap: 10px; color: var(--text-strong); text-decoration: none; font-family: var(--font-display); font-size: var(--fs-18); }
        .kru-membership-header nav { display: flex; align-items: center; gap: var(--sp-2); }
        main { width: min(100%, var(--container-max)); margin: 0 auto; padding: var(--sp-8) var(--sp-5) var(--sp-13); }
        .kru-membership-hero { overflow: hidden; padding: clamp(28px, 6vw, 64px); display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(260px, .8fr); align-items: center; gap: clamp(24px, 5vw, 64px); border: 1px solid rgba(195,176,252,.62); border-radius: var(--r-panel); background: radial-gradient(circle at 92% 10%, rgba(255,255,255,.95), transparent 36%), linear-gradient(135deg, var(--purple-100), var(--pink-50) 54%, var(--blue-100)); box-shadow: var(--shadow-lg); }
        .kru-membership-hero__copy { min-width: 0; }
        .kru-membership-eyebrow, .kru-membership-step { width: fit-content; display: inline-flex; align-items: center; gap: 7px; color: var(--purple-700); font-size: var(--fs-13); font-weight: var(--fw-bold); }
        .kru-membership-hero h1 { margin-top: var(--sp-4); font-size: clamp(2.25rem, 7vw, 4.5rem); letter-spacing: -.04em; }
        .kru-membership-hero__lead { margin-top: var(--sp-4); color: var(--text-body); font-size: clamp(1.05rem, 2.5vw, 1.35rem); line-height: var(--lh-loose); }
        .kru-membership-renewal { width: fit-content; margin-top: var(--sp-6); padding: 10px 14px; display: flex; align-items: center; gap: 9px; border-radius: var(--r-pill); background: rgba(255,255,255,.84); color: var(--text-strong); }
        .kru-membership-renewal svg { color: var(--status-success-fg); }
        .kru-membership-rule { margin-top: var(--sp-4); color: var(--status-danger-fg); font-size: var(--fs-14); font-weight: var(--fw-semibold); }
        .kru-membership-capacity { min-width: 0; padding: var(--sp-7); display: grid; gap: var(--sp-2); border-radius: var(--r-card); background: rgba(255,255,255,.9); box-shadow: var(--shadow-md); }
        .kru-membership-capacity > span:first-child { color: var(--text-muted); font-size: var(--fs-13); }
        .kru-membership-capacity strong { color: var(--text-strong); font-family: var(--font-display); font-size: clamp(1.35rem, 4vw, var(--fs-24)); }
        .kru-membership-capacity p { color: var(--purple-700); font-weight: var(--fw-semibold); }
        .kru-membership-plan { padding: var(--sp-4); display: grid; gap: var(--sp-4); border: 1px solid var(--border-subtle); border-radius: var(--r-card); background: var(--surface-sunken); }
        .kru-membership-plan__heading { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
        .kru-membership-plan__heading h3 { font-size: var(--fs-18); }
        .kru-membership-plan__choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); }
        .kru-membership-plan__choices button { min-height: 84px; padding: var(--sp-4); display: grid; gap: 3px; border: 1px solid var(--border-subtle); border-radius: var(--r-md); background: var(--surface-card); color: var(--text-body); text-align: left; cursor: pointer; }
        .kru-membership-plan__choices button.is-active { border-color: var(--border-brand); background: var(--purple-50); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 16%, transparent); }
        .kru-membership-plan__choices button:disabled { cursor: not-allowed; opacity: .62; }
        .kru-membership-plan__choices strong { color: var(--text-strong); }
        .kru-membership-plan__choices small { color: var(--status-danger-fg); }
        .kru-membership-plan__details { padding-top: var(--sp-2); border-top: 1px solid var(--border-subtle); }
        .kru-membership-plan__details > p { color: var(--text-muted); font-size: var(--fs-14); }
        .kru-membership-current { padding: var(--sp-5); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; border: 1px solid var(--border-brand); border-radius: var(--r-card); background: var(--surface-brand-wash); }
        .kru-membership-current > div:first-child { min-width: 0; display: grid; gap: var(--sp-2); }
        .kru-membership-current strong { color: var(--text-strong); font-size: var(--fs-18); }
        .kru-membership-current span { color: var(--text-muted); font-size: var(--fs-13); }
        .kru-membership-current__actions { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
        .kru-membership-wizard { margin-top: var(--sp-5); padding: clamp(16px, 4vw, 32px); display: grid; gap: var(--sp-5); min-width: 0; max-width: 640px; margin-inline: auto; }
        .kru-membership-planbar { width: fit-content; max-width: 100%; margin: 0 auto; padding: 8px 14px; display: flex; align-items: center; gap: 7px; border-radius: var(--r-pill); background: var(--purple-50); color: var(--purple-700); font-weight: var(--fw-semibold); font-size: var(--fs-14); }
        .kru-membership-summary { padding: var(--sp-4); display: grid; gap: 4px; border: 1px solid var(--border-brand); border-radius: var(--r-md); background: var(--purple-50); }
        .kru-membership-summary strong { font-size: var(--fs-24); color: var(--text-strong); }
        .kru-membership-summary small, .kru-membership-hint { color: var(--text-muted); }
        .kru-membership-hint { margin: 0; font-size: var(--fs-14); }
        .kru-membership-action-block { display: grid; gap: var(--sp-4); }
        .kru-membership-action-block :global(a.kru-btn:hover) { color: var(--white); text-decoration: none; }
        .kru-membership-alert { padding: var(--sp-4); border-radius: var(--r-md); background: var(--status-info-bg); color: var(--status-info-fg); overflow-wrap: anywhere; }
        .kru-membership-alert--warning { background: var(--status-warning-bg); color: var(--status-warning-fg); }
        .kru-membership-alert--danger { background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-membership-conversion { padding: var(--sp-5); display: grid; gap: var(--sp-3); border: 1px solid color-mix(in srgb, var(--status-danger-fg) 28%, transparent); border-radius: var(--r-card); background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-membership-conversion p { line-height: var(--lh-loose); }
        footer { padding: var(--sp-7) var(--sp-5) calc(var(--sp-7) + env(safe-area-inset-bottom)); display: flex; justify-content: center; gap: var(--sp-5); flex-wrap: wrap; border-top: 1px solid var(--border-subtle); color: var(--text-muted); font-size: var(--fs-13); text-align: center; }
        footer :global(a) { min-height: var(--tap-min); padding: 0 var(--sp-2); display: inline-flex; align-items: center; }
        @media (max-width: 820px) {
          .kru-membership-hero { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 620px) {
          .kru-membership-header { align-items: flex-start; }
          .kru-membership-brand strong, .kru-membership-header nav > :global(.kru-btn--ghost) { display: none; }
          .kru-membership-header nav > :global(.kru-btn) { white-space: normal; text-align: center; }
          main { padding-top: var(--sp-5); }
          .kru-membership-hero { padding: var(--sp-5); gap: var(--sp-4); }
          .kru-membership-hero h1 { margin-top: var(--sp-2); font-size: clamp(1.75rem, 9vw, 2.25rem); }
          .kru-membership-hero__lead { margin-top: var(--sp-2); font-size: var(--fs-16, 1rem); }
          .kru-membership-capacity { padding: var(--sp-4); }
          .kru-membership-capacity--plain { display: none; }
          .kru-membership-renewal { width: 100%; align-items: flex-start; border-radius: var(--r-md); }
          .kru-membership-current, .kru-membership-current__actions, .kru-membership-current__actions :global(.kru-btn) { width: 100%; }
          .kru-membership-current__actions :global(.kru-btn) { justify-content: center; }
          .kru-membership-plan__choices { grid-template-columns: minmax(0, 1fr); }
        }
      `}</style>
    </div>
  );
}
