// Sliding-window Rate limiter cho phản hồi góp ý & báo lỗi (max 5/phút per IP/User)
const feedbackRateMap = new Map();
const reportRateMap = new Map();

function checkLimit(map, identifier, max = 5, windowMs = 60 * 1000) {
  const now = Date.now();
  const history = map.get(identifier) || [];
  const valid = history.filter(t => now - t < windowMs);
  if (valid.length >= max) {
    return false;
  }
  valid.push(now);
  map.set(identifier, valid);
  return true;
}

export function checkFeedbackRateLimit(identifier) {
  return checkLimit(feedbackRateMap, identifier, 5, 60 * 1000);
}

export function checkReportRateLimit(identifier) {
  return checkLimit(reportRateMap, identifier, 5, 60 * 1000);
}
