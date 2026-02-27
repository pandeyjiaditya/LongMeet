import api from "./api";

export const createMeeting = (title) => api.post("/meetings", { title });
export const getMeeting = (meetingId) => api.get(`/meetings/${meetingId}`);
export const endMeeting = (meetingId) =>
  api.patch(`/meetings/${meetingId}/end`);
export const getMyMeetings = () => api.get("/meetings/my");
