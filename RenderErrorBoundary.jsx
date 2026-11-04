import { Component } from "react";

export class RenderErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("CampusFlow failed to render.", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="not-found" role="alert">
          <span className="eyebrow">CampusFlow could not load</span>
          <h1>Something went wrong while opening the application.</h1>
          <button
            className="button button-primary"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload application
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
