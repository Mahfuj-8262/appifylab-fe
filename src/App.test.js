import { render, screen } from '@testing-library/react';
import App from './App';

// Unauthenticated visitors land on the login view.
test('renders the login screen by default', () => {
  render(<App />);
  expect(screen.getByText(/login to your account/i)).toBeInTheDocument();
});
