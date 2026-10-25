import React from 'react';

// If any screen throws while rendering, show a friendly recovery card instead
// of a blank white page. Saved data (answers, session) is not affected.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Screen error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f7f9fb', fontFamily: 'inherit' }}>
        <div style={{ maxWidth: 440, textAlign: 'center', background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 16px 40px rgba(20,32,52,.08)' }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Something went wrong on this screen</h1>
          <p style={{ color: '#6b7688', margin: '0 0 20px' }}>Your saved work is safe. Reload the page to continue.</p>
          <button className="button primary" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </main>
    );
  }
}
