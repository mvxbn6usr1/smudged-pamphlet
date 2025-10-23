/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DocumentPreview from '../DocumentPreview';

describe('DocumentPreview Component', () => {
  it('should render with filename', () => {
    render(<DocumentPreview fileName="test.pdf" fileType="application/pdf" />);
    expect(screen.getByText('test.pdf')).toBeInTheDocument();
  });

  it('should show "Untitled Document" when no filename provided', () => {
    render(<DocumentPreview />);
    expect(screen.getByText('Untitled Document')).toBeInTheDocument();
  });

  it('should display PDF Document for PDF files', () => {
    render(<DocumentPreview fileType="application/pdf" />);
    expect(screen.getByText('PDF Document')).toBeInTheDocument();
  });

  it('should display Text Document for text files', () => {
    render(<DocumentPreview fileType="text/plain" />);
    expect(screen.getByText('Text Document')).toBeInTheDocument();
  });

  it('should display File for generic unknown types', () => {
    render(<DocumentPreview fileType="application/unknown" />);
    expect(screen.getByText('File')).toBeInTheDocument();
  });

  it('should render download button when onDownload provided', () => {
    const mockDownload = jest.fn();
    render(<DocumentPreview onDownload={mockDownload} fileName="test.pdf" />);

    const downloadButton = screen.getByRole('button', { name: /download/i });
    expect(downloadButton).toBeInTheDocument();
  });

  it('should call onDownload when button clicked', () => {
    const mockDownload = jest.fn();
    render(<DocumentPreview onDownload={mockDownload} fileName="test.pdf" />);

    const downloadButton = screen.getByRole('button', { name: /download/i });
    fireEvent.click(downloadButton);

    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('should not render download button when onDownload not provided', () => {
    render(<DocumentPreview fileName="test.pdf" />);

    const downloadButton = screen.queryByRole('button', { name: /download/i });
    expect(downloadButton).not.toBeInTheDocument();
  });

  it('should have proper aria-label on download button', () => {
    const mockDownload = jest.fn();
    render(<DocumentPreview onDownload={mockDownload} fileName="test.pdf" />);

    const downloadButton = screen.getByRole('button', { name: 'Download test.pdf' });
    expect(downloadButton).toBeInTheDocument();
  });

  it('should use generic label when no filename for aria-label', () => {
    const mockDownload = jest.fn();
    render(<DocumentPreview onDownload={mockDownload} />);

    const downloadButton = screen.getByRole('button', { name: 'Download document' });
    expect(downloadButton).toBeInTheDocument();
  });
});
