# UI/UX and Visual Design System

## 1. Design objective
Build a polished, professional school administration dashboard that feels calm, consistent, fast and easy to learn. Avoid clutter, excessive gradients, too many colors and oversized cards.

## 2. Main application shell
- Left sidebar: collapsible, grouped navigation with icons and active state.
- Top bar: page title/breadcrumb, global search (when useful), notifications, help/profile menu.
- Main content: consistent spacing, readable width and clear hierarchy.
- Mobile: sidebar becomes a drawer; tables support horizontal scrolling or card/list adaptation.
- Each page includes title, short description where useful, primary action, filters and content.

## 3. Navigation structure
- Dashboard
- Academic
  - Classes
  - Students
  - Teachers
  - Courses / Subjects
  - Exams
  - Attendance
  - Timetable
- Finance
  - School Fees
  - Payments
- Reports
- Settings
  - Academic Years
  - Branches
  - School Registrations
  - Users
  - Roles & Permissions
  - School Profile
  - General Settings

Navigation items must be hidden or disabled based on permissions. Hiding a menu is not authorization; server-side access checks remain mandatory.

## 4. Visual guidance
- Use a restrained palette: neutral backgrounds, one primary brand color, semantic success/warning/danger colors.
- Define design tokens for color, spacing, radius, shadows and typography.
- Use one consistent icon family (Lucide).
- Use clear page titles and section headings.
- Use tables for dense records, cards for summaries, charts for trends and dialogs/drawers for focused actions.
- Avoid showing too many KPI cards on mobile.
- Use consistent button hierarchy: primary, secondary, outline, destructive.
- Provide clear badges for statuses such as Active, Archived, Draft, Published, Paid, Partial and Overdue.
- Use skeletons or loading indicators for slow requests.
- Include empty states that explain what the user can do next.
- Confirm destructive or financially significant actions.
- Forms must have labels, helper text, validation errors and sensible grouping.

## 5. Dashboard requirements
KPI cards:
- Active Students
- Active Teachers
- Classes
- Fees Collected (selected period)
- Outstanding Fees
- Attendance Rate
- Upcoming Exams

Other sections:
- Fees collection trend
- Attendance trend
- Upcoming timetable/exams
- Recent activity
- Quick actions

All values must be permission-filtered and derived from real database records. If there is no data, show an empty state rather than invented sample metrics.

## 6. Data table standard
- Search with debounce where appropriate.
- Filter controls relevant to the module.
- Pagination with total count and page size.
- Sortable columns only when supported by query logic.
- Row actions based on permission.
- Bulk actions only when safe and clearly specified.
- Keep filters in URL query parameters when practical.
- Export action must check export permission separately.

## 7. Accessibility and usability
- Keyboard-operable menus and dialogs.
- Visible focus indicators.
- Form controls have accessible labels.
- Status is not conveyed by color alone.
- Confirmations explain the impact of an action.
- Use readable contrast and appropriate text sizes.
- Keep common tasks reachable in a small number of steps.
