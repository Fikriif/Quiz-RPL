export type UserRole = 'teacher' | 'student';

export type QuizStatus = 'draft' | 'waiting' | 'active' | 'finished';
export type SessionStatus = 'waiting' | 'active' | 'paused' | 'finished';

export type QuestionType = 'multiple_choice' | 'coding';
export type CodingLanguage = 'html_css_js' | 'html_css' | 'javascript' | 'html' | 'css';
export type CodingValidationType = 'exact' | 'test_cases';

export type TestCaseType =
  | 'dom'
  | 'html'
  | 'css'
  | 'function'
  | 'javascript'
  | 'javascript_dom'
  | 'dom_element'
  | 'dom_text'
  | 'css_style'
  | 'dom_attribute'
  | 'js_eval';

export interface JsUnitTest {
  expression?: string;
  expected?: any;
  function_name?: string;
  args?: any[];
  description?: string;
}

export interface DomAction {
  type: 'click' | 'input' | 'change' | 'submit' | 'keydown' | 'focus' | 'blur';
  selector: string;
  value?: string;
  key?: string;
}

export interface DomAssertion {
  selector?: string;
  property?: 'textContent' | 'innerHTML' | 'value' | 'className' | 'checked' | string;
  expected?: any;
  has_class?: string | string[];
  not_has_class?: string | string[];
  styles?: Record<string, string>;
  attribute?: { name: string; value?: string; exists?: boolean };
  expected_count?: number;
}

export interface TestCase {
  id: string;
  description?: string;
  type: TestCaseType;

  // HTML / DOM evaluations
  selector?: string;
  property?: string;
  expected?: any;
  expected_count?: number;
  expected_text?: string;
  text_match_mode?: 'exact' | 'contains' | 'regex' | 'trim_equals';
  attribute?: { name: string; value?: string; exists?: boolean };
  attributes?: Record<string, string | boolean>;
  has_children?: string[];

  // CSS evaluations
  styles?: Record<string, string>;
  computed_styles?: Record<string, string>;

  // JavaScript function & logic evaluations
  name?: string;
  input?: any[];
  args?: any[];
  tests?: JsUnitTest[];
  expression?: string;
  custom_js?: string;

  // JavaScript DOM interaction & assertions
  action?: DomAction;
  actions?: DomAction[];
  assert?: DomAssertion;
  assertions?: DomAssertion[];

  // Legacy compatibility fields
  expected_value?: string;
}

export interface TestResultItem {
  id: string;
  description: string;
  passed: boolean;
  message?: string;
  expected?: string;
  actual?: string;
  test?: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Quiz {
  id: string;
  title: string;
  description: string | null;
  code: string;
  status: QuizStatus;
  starting_points: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joins
  categories?: Category[];
  questions?: Question[];
  teams?: Team[];
  creator?: Profile;
  sessions?: QuizSession[];
}

export interface Category {
  id: string;
  quiz_id: string;
  name: string;
  order_number: number;
  created_at: string;
  questions?: Question[];
}

export interface Question {
  id: string;
  quiz_id: string;
  category_id: string;
  question_type?: QuestionType;
  validation_type?: CodingValidationType;
  language?: CodingLanguage;
  question: string;
  starter_code?: string | null;
  expected_output?: string | null;
  test_cases?: TestCase[];
  time_limit_seconds?: number;
  option_a?: string | null;
  option_b?: string | null;
  option_c?: string | null;
  option_d?: string | null;
  correct_answer?: 'A' | 'B' | 'C' | 'D' | null;
  points: number;
  explanation: string | null;
  image_url: string | null;
  order_number: number;
  created_at: string;
  updated_at: string;
  category?: Category;
}

export interface Team {
  id: string;
  quiz_id: string;
  name: string;
  description: string | null;
  starting_points: number;
  current_points: number;
  created_at: string;
  updated_at: string;
  members?: TeamMember[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  student_id: string;
  quiz_id?: string;
  joined_at: string;
  student?: Profile;
  team?: Team;
}

export type TurnStatus = 'waiting_selection' | 'answering' | 'completed';

export interface QuizSession {
  id: string;
  quiz_id: string;
  session_name?: string;
  code?: string | null;
  is_exam_mode?: boolean;
  status: SessionStatus;
  current_question_id: string | null;
  current_team_id: string | null;
  current_player_id?: string | null;
  turn_number?: number;
  turn_status?: TurnStatus;
  turn_started_at?: string | null;
  created_by?: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  quiz?: Quiz;
  current_question?: Question;
  current_team?: Team;
  current_player?: Profile;
}

export interface QuestionAttempt {
  id: string;
  quiz_session_id: string;
  question_id: string;
  team_id: string;
  student_id: string | null;
  answer: string;
  is_correct: boolean;
  points_change: number;
  answered_at: string;
  question?: Question;
  team?: Team;
  student?: Profile;
}

export interface CodingSubmission {
  id: string;
  quiz_session_id: string;
  question_id: string;
  team_id: string;
  student_id: string;
  code_answer: string;
  test_results: TestResultItem[];
  score: number;
  max_points: number;
  submitted_at: string;
  student?: Profile;
  team?: Team;
  question?: Question;
}

export interface ExamEvent {
  id: string;
  quiz_session_id: string;
  student_id: string;
  event_type: 'tab_hidden' | 'window_blur' | 'fullscreen_exit';
  details?: Record<string, any>;
  created_at: string;
  student?: Profile;
}

export interface QuestionUsage {
  id: string;
  quiz_session_id: string;
  question_id: string;
  team_id: string | null;
  used_at: string;
}

export type CellState = 'AVAILABLE' | 'SELECTED' | 'USED';

export interface QuestionBoardCell {
  question: Question;
  points: number;
  state: CellState;
  categoryName: string;
}

export interface SubmitAnswerResult {
  success: boolean;
  is_correct: boolean;
  points_change: number;
  new_score: number;
  correct_answer?: string;
  explanation?: string;
  error?: string;
}

export interface SubmitCodingResult {
  success: boolean;
  is_correct: boolean;
  score: number;
  max_points: number;
  new_score: number;
  points_change: number;
  is_perfect?: boolean;
  passed_count?: number;
  total_count?: number;
  test_results?: TestResultItem[];
  error?: string;
}
