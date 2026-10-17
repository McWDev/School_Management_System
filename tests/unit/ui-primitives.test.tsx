import { render, screen } from "@testing-library/react";
import { GraduationCap } from "lucide-react";
import { describe, expect, it } from "vitest";
import { FormField } from "@/components/forms/form-field";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";

describe("StatCard", () => {
  it("shows a dash and hint instead of a number when there is no data", () => {
    render(
      <StatCard label="Active Students" icon={GraduationCap} emptyHint="Add students first" />,
    );
    expect(screen.getByLabelText("Active Students: no data")).toHaveTextContent("—");
    expect(screen.getByText("Add students first")).toBeInTheDocument();
  });

  it("shows the value when provided", () => {
    render(<StatCard label="Active Students" icon={GraduationCap} value="1,204" />);
    expect(screen.getByText("1,204")).toBeInTheDocument();
  });
});

describe("FormField", () => {
  it("links the label, helper text and error to the control", () => {
    render(
      <FormField
        id="name"
        label="Full name"
        required
        helperText="As on records"
        error="Name is required"
      >
        {(props) => <Input {...props} />}
      </FormField>,
    );
    const input = screen.getByLabelText(/Full name/);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("As on records Name is required");
    expect(screen.getByRole("alert")).toHaveTextContent("Name is required");
  });
});
