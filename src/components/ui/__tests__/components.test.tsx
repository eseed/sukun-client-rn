import { fireEvent, renderWithProviders, screen } from '../../../test-utils';
import { Badge, Button, Tag } from '..';
import { Checkbox, QuantityStepper } from '../Selection';

describe('Button', () => {
  it('renders its label and fires onPress', () => {
    const onPress = jest.fn();
    renderWithProviders(<Button label="Send me a code" onPress={onPress} />);

    fireEvent.press(screen.getByText('Send me a code'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while disabled', () => {
    const onPress = jest.fn();
    renderWithProviders(<Button label="Verify" onPress={onPress} disabled />);

    fireEvent.press(screen.getByText('Verify'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('swaps the label for a spinner while loading, and stays inert', () => {
    const onPress = jest.fn();
    renderWithProviders(<Button label="Continue" onPress={onPress} loading />);

    expect(screen.queryByText('Continue')).toBeNull();
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Tag', () => {
  it('reports its selected state for assistive tech', () => {
    renderWithProviders(<Tag label="Festivals" selected />);
    expect(screen.getByRole('button', { selected: true })).toBeTruthy();
  });
});

describe('Badge', () => {
  it('renders the label', () => {
    renderWithProviders(<Badge label="Paid" tone="sky" />);
    expect(screen.getByText('Paid')).toBeTruthy();
  });
});

describe('QuantityStepper', () => {
  it('increments and decrements within bounds', () => {
    const onChange = jest.fn();
    renderWithProviders(<QuantityStepper value={2} min={1} max={3} onChange={onChange} />);

    fireEvent.press(screen.getByLabelText('Add one ticket'));
    expect(onChange).toHaveBeenLastCalledWith(3);

    fireEvent.press(screen.getByLabelText('Remove one ticket'));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('will not go below the minimum', () => {
    const onChange = jest.fn();
    renderWithProviders(<QuantityStepper value={1} min={1} max={6} onChange={onChange} />);

    fireEvent.press(screen.getByLabelText('Remove one ticket'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Checkbox', () => {
  it('toggles', () => {
    const onToggle = jest.fn();
    renderWithProviders(
      <Checkbox checked={false} onToggle={onToggle} label="I understand" />,
    );

    fireEvent.press(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
