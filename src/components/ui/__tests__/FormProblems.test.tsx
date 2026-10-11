import { fireEvent, render, screen } from '@testing-library/react-native';
import { FormProblems } from '../FormProblems';

function renderWith(labels: string[], onSelect = jest.fn()) {
  const problems = labels.map((label) => ({ name: label.replace(/\s/g, ''), label }));
  render(<FormProblems problems={problems} onSelect={onSelect} />);
  return onSelect;
}

describe('FormProblems', () => {
  it('says nothing while nothing is wrong', () => {
    renderWith([]);
    expect(screen.queryByText(/missing or incomplete/)).toBeNull();
  });

  it('names one field in a sentence', () => {
    renderWith(['gender']);
    expect(screen.getByText(/missing or incomplete/)).toHaveTextContent(
      'Your gender is missing or incomplete.',
    );
  });

  it('joins two with "and", and more with commas before it', () => {
    renderWith(['email', 'gender']);
    expect(screen.getByText(/missing or incomplete/)).toHaveTextContent(
      'Your email and gender are missing or incomplete.',
    );
    screen.unmount();

    renderWith(['full name', 'email', 'date of birth', 'living area']);
    expect(screen.getByText(/missing or incomplete/)).toHaveTextContent(
      'Your full name, email, date of birth and living area are missing or incomplete.',
    );
  });

  it('takes the person to a field it names', () => {
    const onSelect = renderWith(['full name', 'living area']);
    fireEvent.press(screen.getByText('living area'));
    expect(onSelect).toHaveBeenCalledWith('livingarea');
  });
});
