const leads = {};

function createLead(callSid, phone) {
  leads[callSid] = {
    callSid,
    phone: phone || "",
    name: "",
    address: "",
    summary: "",
    smsSentToCaller: false,
    smsSentToOwner: false,
    completed: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return leads[callSid];
}

export function getLead(callSid, phone) {
  if (!callSid) {
    return createLead(`temp-${Date.now()}`, phone);
  }

  const existing = leads[callSid];

  if (existing) {
    if (phone && !existing.phone) {
      existing.phone = phone;
    }

    existing.updatedAt = Date.now();
    return existing;
  }

  return createLead(callSid, phone);
}

export function updateLead(callSid, updates) {
  const lead = getLead(callSid);
  Object.assign(lead, updates, { updatedAt: Date.now() });
  return lead;
}

export function extractLeadDetails({ lead, speechResult, lastAssistantMessage }) {
  const cleaned = speechResult.trim();
  const normalized = cleaned.replace(/[.,]/g, "");
  const words = normalized.split(/\s+/).filter(Boolean);
  const containsNumber = /\d/.test(cleaned);
  const likelyAddress =
    containsNumber &&
    /(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|way|place|pl|trail|trl|circle|cir|parkway|pkwy|highway|hwy|unit|apt|suite|ste)\b/i.test(
      cleaned,
    );
  const likelyName =
    !containsNumber &&
    words.length > 0 &&
    words.length <= 3 &&
    words.every((word) => /^[A-Za-z'-]+$/.test(word));

  const askedForName = /name for the inspection/i.test(lastAssistantMessage || "");
  const askedForAddress = /address where this is needed/i.test(lastAssistantMessage || "");

  const updates = {};

  if (!lead.name && (askedForName || likelyName) && likelyName) {
    updates.name = cleaned;
  }

  if (!lead.address && (askedForAddress || likelyAddress) && containsNumber) {
    updates.address = cleaned;
  }

  return updates;
}

export function isLeadComplete(lead) {
  return Boolean(lead.name && lead.address);
}
