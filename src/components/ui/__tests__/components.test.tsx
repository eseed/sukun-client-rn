import { fireEvent, renderWithProviders, screen } from '../../../test-utils';
import {
  Badge,
  Button,
  InlineError,
  MarkdownText,
  PageHeader,
  ResourceState,
  Tag,
  Text,
} from '..';
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

describe('ResourceState', () => {
  it('renders loading content', () => {
    renderWithProviders(<ResourceState status="loading" loadingLabel="Loading events" />);

    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.getByText('Loading events')).toBeTruthy();
  });

  it('renders an error with a working retry action', () => {
    const onRetry = jest.fn();
    renderWithProviders(
      <ResourceState
        status="error"
        errorTitle="Could not load events"
        errorMessage="Please try again."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders empty content and passes through success content', () => {
    const { rerender } = renderWithProviders(
      <ResourceState status="empty" emptyMessage="No tickets yet" />,
    );
    expect(screen.getByText('No tickets yet')).toBeTruthy();

    rerender(
      <ResourceState status="success">
        <Text>Loaded content</Text>
      </ResourceState>,
    );
    expect(screen.getByText('Loaded content')).toBeTruthy();
  });

  it('does not render success children or a retry action for an empty state', () => {
    renderWithProviders(
      <ResourceState status="empty" onRetry={jest.fn()}>
        <Text>Should not render</Text>
      </ResourceState>,
    );

    expect(screen.queryByText('Should not render')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

describe('MarkdownText', () => {
  it('renders API HTML as native text and exposes safe links as actions', () => {
    const onLinkPress = jest.fn();
    renderWithProviders(
      <MarkdownText
        markdown={'<p>Read <strong>the guide</strong> at <a href="https://sukun.test/guide">Sukun</a>.</p>'}
        onLinkPress={onLinkPress}
      />,
    );

    expect(screen.queryByText(/<p>/)).toBeNull();
    fireEvent.press(screen.getByRole('link', { name: 'Sukun' }));
    expect(onLinkPress).toHaveBeenCalledWith('https://sukun.test/guide');
  });

  it('does not make unsafe links actionable', () => {
    renderWithProviders(<MarkdownText markdown="[Local](javascript:alert(1))" />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Local')).toBeTruthy();
  });
});

describe('InlineError', () => {
  it('renders an accessible message', () => {
    renderWithProviders(<InlineError message="Enter a valid phone number" />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Enter a valid phone number')).toBeTruthy();
  });
});

describe('PageHeader', () => {
  it('renders supporting content and handles back navigation', () => {
    const onBack = jest.fn();
    renderWithProviders(
      <PageHeader title="Your tickets" subtitle="Ready when you are" onBack={onBack} />,
    );

    expect(screen.getByRole('header')).toBeTruthy();
    expect(screen.getByText('Ready when you are')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Go back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
