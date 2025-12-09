// Mock data for Piano Studio Student Portal
// Structured for easy Supabase migration

export type Student = {
  id: string
  name: string
  email: string
  phone: string
  credits_remaining: number
  credits_total: number
  balance_due: number
  zoom_link: string
  last_lesson_date: string
  next_lesson?: {
    date: string
    time: string
    duration: number
  }
}

export type Lesson = {
  id: string
  student_id: string
  date: string
  time: string
  duration: number
  status: "scheduled" | "completed" | "cancelled" | "no-show" | "rescheduled"
  teacher_notes?: string
  video_url?: string
  sheet_music_url?: string
  homework?: string
}

export type Event = {
  id: string
  title: string
  description: string
  date: string
  time: string
  type: "recital" | "group-class" | "workshop"
  spots_available: number
  signed_up: boolean
}

export type Download = {
  id: string
  title: string
  description: string
  category: "scales" | "exercises" | "theory" | "sheet-music"
  file_url: string
  uploaded_date: string
}

export type Tutorial = {
  id: string
  title: string
  description: string
  category: "technique" | "theory" | "repertoire" | "practice-tips"
  video_url: string
  duration: string
  thumbnail_url?: string
}

export type Message = {
  id: string
  student_id: string
  sender: "student" | "teacher"
  content: string
  timestamp: string
  read: boolean
}

export type CreditPackage = {
  id: string
  name: string
  credits: number
  price: number
  price_per_lesson: number
  popular?: boolean
}

export type MakeupSlot = {
  id: string
  day: string
  date: string
  time: string
  available: boolean
}

// Mock Students
export const mockStudents: Student[] = [
  {
    id: "student-1",
    name: "Emily Chen",
    email: "student@piano.com",
    phone: "(555) 123-4567",
    credits_remaining: 2,
    credits_total: 4,
    balance_due: 0,
    zoom_link: "https://zoom.us/j/123456789",
    last_lesson_date: "2025-11-22",
    next_lesson: {
      date: "2025-12-02",
      time: "3:00 PM",
      duration: 60,
    },
  },
  {
    id: "student-2",
    name: "Marcus Johnson",
    email: "marcus@email.com",
    phone: "(555) 234-5678",
    credits_remaining: 1,
    credits_total: 4,
    balance_due: 20,
    zoom_link: "https://zoom.us/j/987654321",
    last_lesson_date: "2025-11-25",
    next_lesson: {
      date: "2025-12-02",
      time: "4:30 PM",
      duration: 60,
    },
  },
  {
    id: "student-3",
    name: "Sophie Martinez",
    email: "sophie@email.com",
    phone: "(555) 345-6789",
    credits_remaining: 4,
    credits_total: 4,
    balance_due: 0,
    zoom_link: "https://zoom.us/j/456789123",
    last_lesson_date: "2025-11-20",
    next_lesson: {
      date: "2025-12-02",
      time: "5:00 PM",
      duration: 45,
    },
  },
  {
    id: "student-4",
    name: "David Kim",
    email: "david@email.com",
    phone: "(555) 456-7890",
    credits_remaining: 0,
    credits_total: 4,
    balance_due: 40,
    zoom_link: "https://zoom.us/j/789123456",
    last_lesson_date: "2025-11-15",
  },
]

// Mock Lessons
export const mockLessons: Lesson[] = [
  {
    id: "lesson-1",
    student_id: "student-1",
    date: "2025-11-22",
    time: "3:00 PM",
    duration: 60,
    status: "completed",
    teacher_notes:
      "Excellent progress on Bach Prelude in C Major. Focus on dynamics and phrasing. Continue practicing scales - C, G, and D major with hands together. Work on articulation in the left hand.",
    video_url: "https://example.com/lesson-1.mp4",
    sheet_music_url: "https://example.com/bach-prelude.pdf",
    homework: "Practice Bach Prelude bars 1-16 slowly. Hanon exercises 1-5 daily.",
  },
  {
    id: "lesson-2",
    student_id: "student-1",
    date: "2025-11-15",
    time: "3:00 PM",
    duration: 60,
    status: "completed",
    teacher_notes: "Great work on Czerny Etude. Continue with finger independence exercises.",
    video_url: "https://example.com/lesson-2.mp4",
    homework: "Complete Czerny Op. 299 No. 1",
  },
  {
    id: "lesson-3",
    student_id: "student-1",
    date: "2025-11-08",
    time: "3:00 PM",
    duration: 60,
    status: "completed",
    teacher_notes: "Introduced new piece: Clementi Sonatina. Working on sight-reading skills.",
    sheet_music_url: "https://example.com/clementi.pdf",
  },
  {
    id: "lesson-4",
    student_id: "student-2",
    date: "2025-11-25",
    time: "4:30 PM",
    duration: 60,
    status: "completed",
    teacher_notes: "Strong improvement on jazz standards. Work on improvisation over ii-V-I progressions.",
    video_url: "https://example.com/lesson-jazz.mp4",
  },
]

// Mock Events
export const mockEvents: Event[] = [
  {
    id: "event-1",
    title: "Winter Recital 2025",
    description: "Annual student performance showcase at the Community Arts Center",
    date: "2025-12-15",
    time: "6:00 PM",
    type: "recital",
    spots_available: 12,
    signed_up: false,
  },
  {
    id: "event-2",
    title: "Jazz Theory Workshop",
    description: "Learn jazz harmony and improvisation techniques",
    date: "2025-12-08",
    time: "2:00 PM",
    type: "workshop",
    spots_available: 5,
    signed_up: true,
  },
  {
    id: "event-3",
    title: "Group Masterclass",
    description: "Performance practice and peer feedback session",
    date: "2025-12-10",
    time: "4:00 PM",
    type: "group-class",
    spots_available: 8,
    signed_up: false,
  },
]

// Mock Makeup Slots
export const mockMakeupSlots: MakeupSlot[] = [
  {
    id: "slot-1",
    day: "Tuesday",
    date: "12/03",
    time: "4:00 PM",
    available: true,
  },
  {
    id: "slot-2",
    day: "Wednesday",
    date: "12/04",
    time: "2:00 PM",
    available: true,
  },
  {
    id: "slot-3",
    day: "Thursday",
    date: "12/05",
    time: "6:00 PM",
    available: true,
  },
]

// Mock Admin Data
export const mockAdmin = {
  id: "admin-1",
  name: "Professor Williams",
  email: "admin@piano.com",
}

// Mock Downloads Data
export const mockDownloads: Download[] = [
  {
    id: "download-1",
    title: "C Major Scale - All Forms",
    description: "Complete scale patterns with fingering",
    category: "scales",
    file_url: "https://example.com/c-major-scales.pdf",
    uploaded_date: "2025-11-01",
  },
  {
    id: "download-2",
    title: "Hanon Exercises 1-10",
    description: "Daily finger independence exercises",
    category: "exercises",
    file_url: "https://example.com/hanon-1-10.pdf",
    uploaded_date: "2025-10-15",
  },
  {
    id: "download-3",
    title: "Music Theory Basics",
    description: "Circle of fifths and key signatures",
    category: "theory",
    file_url: "https://example.com/theory-basics.pdf",
    uploaded_date: "2025-09-20",
  },
  {
    id: "download-4",
    title: "Czerny Etude Op. 299 No. 1",
    description: "Technical study for velocity",
    category: "sheet-music",
    file_url: "https://example.com/czerny-299-1.pdf",
    uploaded_date: "2025-11-10",
  },
  {
    id: "download-5",
    title: "G Major Arpeggios",
    description: "Four octave arpeggio patterns",
    category: "scales",
    file_url: "https://example.com/g-arpeggios.pdf",
    uploaded_date: "2025-10-28",
  },
  {
    id: "download-6",
    title: "Chord Progressions Guide",
    description: "Common progressions in all keys",
    category: "theory",
    file_url: "https://example.com/chord-progressions.pdf",
    uploaded_date: "2025-11-05",
  },
]

// Mock Tutorials Data
export const mockTutorials: Tutorial[] = [
  {
    id: "tutorial-1",
    title: "Proper Hand Position & Posture",
    description: "Essential technique for preventing injury and improving sound quality",
    category: "technique",
    video_url: "https://example.com/hand-position.mp4",
    duration: "8:45",
    thumbnail_url: "/pianist-hands-proper-position.jpg",
  },
  {
    id: "tutorial-2",
    title: "Understanding Time Signatures",
    description: "Master 3/4, 4/4, 6/8 and other common time signatures",
    category: "theory",
    video_url: "https://example.com/time-signatures.mp4",
    duration: "12:20",
    thumbnail_url: "/music-notation-time-signature.jpg",
  },
  {
    id: "tutorial-3",
    title: "How to Practice Scales Effectively",
    description: "Daily routine for building speed and accuracy",
    category: "practice-tips",
    video_url: "https://example.com/scale-practice.mp4",
    duration: "10:15",
    thumbnail_url: "/piano-scales-practice.jpg",
  },
  {
    id: "tutorial-4",
    title: "Interpreting Bach's Prelude in C",
    description: "Phrasing, dynamics, and historical context",
    category: "repertoire",
    video_url: "https://example.com/bach-prelude.mp4",
    duration: "15:30",
    thumbnail_url: "/sheet-music-bach-prelude.jpg",
  },
  {
    id: "tutorial-5",
    title: "Pedaling Techniques",
    description: "When and how to use the sustain pedal",
    category: "technique",
    video_url: "https://example.com/pedaling.mp4",
    duration: "9:50",
    thumbnail_url: "/piano-pedals-close-up.jpg",
  },
  {
    id: "tutorial-6",
    title: "Building a Daily Practice Routine",
    description: "Maximize progress with structured practice sessions",
    category: "practice-tips",
    video_url: "https://example.com/practice-routine.mp4",
    duration: "11:40",
    thumbnail_url: "/practice-schedule-planner.jpg",
  },
]

export const mockMessages: Message[] = [
  {
    id: "msg-1",
    student_id: "student-1",
    sender: "teacher",
    content:
      "Great job on your Bach Prelude today! Remember to focus on keeping the left hand softer than the right in the melodic sections.",
    timestamp: "2025-11-22T15:30:00",
    read: true,
  },
  {
    id: "msg-2",
    student_id: "student-1",
    sender: "student",
    content: "Thank you! I've been practicing the fingering you showed me. Should I use the same pattern in bar 15?",
    timestamp: "2025-11-22T18:45:00",
    read: true,
  },
  {
    id: "msg-3",
    student_id: "student-1",
    sender: "teacher",
    content:
      "Yes, the same fingering works well there. Also, I've uploaded a new tutorial on pedaling that will help with the legato passages. Check the Tutorials section!",
    timestamp: "2025-11-23T09:15:00",
    read: true,
  },
  {
    id: "msg-4",
    student_id: "student-1",
    sender: "student",
    content: "Perfect, I'll watch it tonight. Also, is it okay if I arrive 5 minutes early next week to warm up?",
    timestamp: "2025-11-23T12:20:00",
    read: true,
  },
  {
    id: "msg-5",
    student_id: "student-1",
    sender: "teacher",
    content: "Of course! The studio will be open. See you then.",
    timestamp: "2025-11-23T14:00:00",
    read: true,
  },
  {
    id: "msg-6",
    student_id: "student-1",
    sender: "teacher",
    content:
      "Reminder: Don't forget to prepare your piece selection for the Winter Recital by next lesson. Let me know if you need help choosing!",
    timestamp: "2025-11-28T10:00:00",
    read: false,
  },
  // Student 2 messages
  {
    id: "msg-7",
    student_id: "student-2",
    sender: "teacher",
    content: "Marcus, your jazz improvisation is coming along nicely! Keep working on the ii-V-I progressions.",
    timestamp: "2025-11-25T17:00:00",
    read: true,
  },
  {
    id: "msg-8",
    student_id: "student-2",
    sender: "student",
    content: "Thanks! I've been listening to a lot of Bill Evans. Should I transcribe some of his solos?",
    timestamp: "2025-11-25T19:30:00",
    read: true,
  },
  {
    id: "msg-9",
    student_id: "student-2",
    sender: "teacher",
    content: "Start with 'Waltz for Debby' - the harmonies are beautiful and manageable.",
    timestamp: "2025-11-26T10:15:00",
    read: true,
  },
  {
    id: "msg-10",
    student_id: "student-2",
    sender: "student",
    content: "Quick question - I noticed I have a balance due. Is that from the late cancellation last week?",
    timestamp: "2025-11-27T14:00:00",
    read: false,
  },
  // Student 3 messages
  {
    id: "msg-11",
    student_id: "student-3",
    sender: "student",
    content: "Hi Professor! I just purchased a new practice keyboard. Any tips for setting it up?",
    timestamp: "2025-11-20T11:00:00",
    read: true,
  },
  {
    id: "msg-12",
    student_id: "student-3",
    sender: "teacher",
    content:
      "Congratulations Sophie! Make sure it's at the correct height - your forearms should be parallel to the floor.",
    timestamp: "2025-11-20T13:30:00",
    read: true,
  },
  {
    id: "msg-13",
    student_id: "student-3",
    sender: "student",
    content:
      "Got it! Also wanted to ask - is there a way to practice quietly at night without losing touch sensitivity?",
    timestamp: "2025-11-21T20:45:00",
    read: true,
  },
  {
    id: "msg-14",
    student_id: "student-3",
    sender: "teacher",
    content:
      "Use headphones and practice at a moderate volume. Many keyboards have a 'touch' setting - keep it on 'medium' or 'hard'.",
    timestamp: "2025-11-22T08:00:00",
    read: true,
  },
  // Student 4 messages
  {
    id: "msg-15",
    student_id: "student-4",
    sender: "teacher",
    content: "David, I noticed you're out of credits. Would you like to renew your package?",
    timestamp: "2025-11-15T16:00:00",
    read: true,
  },
  {
    id: "msg-16",
    student_id: "student-4",
    sender: "student",
    content: "Yes, I've been meaning to. I'll purchase a new package this week. Sorry about the delay!",
    timestamp: "2025-11-16T09:00:00",
    read: true,
  },
  {
    id: "msg-17",
    student_id: "student-4",
    sender: "teacher",
    content:
      "No problem! Just let me know when you're ready to schedule. Looking forward to continuing our Chopin work.",
    timestamp: "2025-11-16T11:30:00",
    read: false,
  },
]

// Mock Credit Packages
export const mockCreditPackages: CreditPackage[] = [
  {
    id: "pkg-single",
    name: "Single Lesson",
    credits: 1,
    price: 75,
    price_per_lesson: 75,
  },
  {
    id: "pkg-standard",
    name: "4-Lesson Package",
    credits: 4,
    price: 260,
    price_per_lesson: 65,
    popular: true,
  },
]

// Helper functions for mock data (will be replaced with Supabase calls)
export const getStudentByEmail = (email: string): Student | undefined => {
  return mockStudents.find((s) => s.email === email)
}

export const getLessonsByStudentId = (studentId: string): Lesson[] => {
  return mockLessons.filter((l) => l.student_id === studentId)
}

export const getTodaysLessons = (): Array<Lesson & { student: Student }> => {
  const today = "2025-12-02"
  return mockStudents
    .filter((s) => s.next_lesson?.date === today)
    .map((student) => ({
      id: `today-${student.id}`,
      student_id: student.id,
      date: student.next_lesson!.date,
      time: student.next_lesson!.time,
      duration: student.next_lesson!.duration,
      status: "scheduled" as const,
      student,
    }))
}

export const getMessagesByStudentId = (studentId: string): Message[] => {
  return mockMessages
    .filter((m) => m.student_id === studentId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

export const getStudentsWithLastMessage = (): Array<Student & { lastMessage?: Message; unreadCount: number }> => {
  return mockStudents.map((student) => {
    const studentMessages = mockMessages.filter((m) => m.student_id === student.id)
    const sortedMessages = studentMessages.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    const unreadCount = studentMessages.filter((m) => !m.read && m.sender === "student").length
    return {
      ...student,
      lastMessage: sortedMessages[0],
      unreadCount,
    }
  })
}

export const getUnreadCountForStudent = (studentId: string): number => {
  return mockMessages.filter((m) => m.student_id === studentId && !m.read && m.sender === "student").length
}

export const getTotalUnreadForTeacher = (): number => {
  return mockMessages.filter((m) => !m.read && m.sender === "student").length
}
