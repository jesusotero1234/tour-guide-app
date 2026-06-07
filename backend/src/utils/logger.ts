/**
 * Simple logger utility for consistent logging across the application
 */
class Logger {
  /**
   * Log an informational message
   */
  info(message: string, data?: any): void {
    this.log('INFO', message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: any): void {
    this.log('WARN', message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, data?: any): void {
    this.log('ERROR', message, data);
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: any): void {
    // Only log debug messages in development environment
    if (process.env.NODE_ENV === 'development') {
      this.log('DEBUG', message, data);
    }
  }

  /**
   * Internal log method
   */
  private log(level: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logData = data ? ` ${JSON.stringify(data, this.replacer)}` : '';
    
    console.log(`[${timestamp}] ${level}: ${message}${logData}`);
  }

  /**
   * Custom replacer to handle circular references and errors
   */
  private replacer(key: string, value: any): any {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }
    return value;
  }
}

// Export a singleton instance
export default new Logger();
