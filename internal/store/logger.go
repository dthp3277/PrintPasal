// Package store provides a simple structured logger that writes to both
// stdout and a daily rotating log file simultaneously.
package store

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Logger is a simple structured logger.
type Logger struct {
	logsDir    string
	mu         sync.Mutex
	currentDay string
	file       *os.File
	logger     *log.Logger
}

// NewLogger creates a Logger that writes to logsDir/YYYY-MM-DD.log
// and also to stdout.
func NewLogger(logsDir string) (*Logger, error) {
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		return nil, fmt.Errorf("could not create logs dir: %w", err)
	}
	l := &Logger{logsDir: logsDir}
	if err := l.rotate(); err != nil {
		return nil, err
	}
	return l, nil
}

// rotate opens (or reopens) the log file for today's date.
func (l *Logger) rotate() error {
	today := time.Now().Format("2006-01-02")
	if today == l.currentDay && l.file != nil {
		return nil
	}
	if l.file != nil {
		l.file.Close()
	}
	path := filepath.Join(l.logsDir, today+".log")
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("could not open log file: %w", err)
	}
	l.file = f
	l.currentDay = today
	// MultiWriter so every line goes to both file and stdout
	l.logger = log.New(os.Stdout, "", 0)
	return nil
}

func (l *Logger) write(level, source, msg string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	_ = l.rotate() // handle midnight day-roll

	line := fmt.Sprintf("[%s] [%-5s] [%-8s] %s",
		time.Now().Format("2006-01-02 15:04:05"),
		level,
		source,
		msg,
	)
	l.logger.Println(line)
	fmt.Fprintln(l.file, line)
}

func (l *Logger) Info(source, msg string)  { l.write("INFO", source, msg) }
func (l *Logger) Warn(source, msg string)  { l.write("WARN", source, msg) }
func (l *Logger) Error(source, msg string) { l.write("ERROR", source, msg) }

func (l *Logger) Infof(source, format string, args ...any) {
	l.Info(source, fmt.Sprintf(format, args...))
}
func (l *Logger) Warnf(source, format string, args ...any) {
	l.Warn(source, fmt.Sprintf(format, args...))
}
func (l *Logger) Errorf(source, format string, args ...any) {
	l.Error(source, fmt.Sprintf(format, args...))
}
