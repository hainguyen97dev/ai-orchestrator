package domain

import (
	"errors"
	"fmt"
	"strings"
)

// PipelineDefinition is a versioned, ordered handoff between work stages.
// A run pins one version; editing a pipeline creates a new definition version.
type PipelineDefinition struct {
	ID        string          `json:"id"`
	ProjectID ProjectID       `json:"projectId"`
	Version   int64           `json:"version"`
	Name      string          `json:"name"`
	Stages    []PipelineStage `json:"stages"`
}

type PipelineStageMode string

const (
	PipelineStageManual   PipelineStageMode = "manual"
	PipelineStageAgent    PipelineStageMode = "agent"
	PipelineStageAssisted PipelineStageMode = "assisted"
)

// PipelineStage describes the work and the evidence required before handoff.
// Agent and assisted stages use the existing Session Manager when executed.
type PipelineStage struct {
	ID               string            `json:"id"`
	Name             string            `json:"name"`
	Mode             PipelineStageMode `json:"mode"`
	Brief            string            `json:"brief"`
	RequiresApproval bool              `json:"requiresApproval"`
	MaxRejections    int               `json:"maxRejections"`
}

const MaxPipelineRejections = 5

// ValidatePipelineDefinition rejects definitions that cannot be run safely as
// a linear sequence. It does not create a run or launch an agent.
func ValidatePipelineDefinition(def PipelineDefinition) error {
	if strings.TrimSpace(def.ID) == "" || strings.TrimSpace(string(def.ProjectID)) == "" {
		return errors.New("pipeline and project IDs are required")
	}
	if def.Version < 1 {
		return errors.New("pipeline version must be positive")
	}
	if strings.TrimSpace(def.Name) == "" {
		return errors.New("pipeline name is required")
	}
	if len(def.Stages) == 0 {
		return errors.New("pipeline requires at least one stage")
	}
	seen := make(map[string]struct{}, len(def.Stages))
	for index, stage := range def.Stages {
		label := fmt.Sprintf("stage %d", index+1)
		if strings.TrimSpace(stage.ID) == "" || strings.TrimSpace(stage.Name) == "" {
			return fmt.Errorf("%s requires an ID and name", label)
		}
		if _, exists := seen[stage.ID]; exists {
			return fmt.Errorf("duplicate stage ID %q", stage.ID)
		}
		seen[stage.ID] = struct{}{}
		switch stage.Mode {
		case PipelineStageManual, PipelineStageAgent, PipelineStageAssisted:
		default:
			return fmt.Errorf("%s has unsupported mode %q", label, stage.Mode)
		}
		if strings.TrimSpace(stage.Brief) == "" {
			return fmt.Errorf("%s requires a brief", label)
		}
		if stage.MaxRejections < 0 || stage.MaxRejections > MaxPipelineRejections {
			return fmt.Errorf("%s max rejections must be between 0 and %d", label, MaxPipelineRejections)
		}
		if stage.MaxRejections > 0 && !stage.RequiresApproval {
			return fmt.Errorf("%s cannot retry rejection without an approval gate", label)
		}
	}
	return nil
}

type PipelineHandoffDecision string

const (
	PipelineHandoffAccept PipelineHandoffDecision = "accept"
	PipelineHandoffReject PipelineHandoffDecision = "reject"
)

// PipelineHandoffResult is the next action after a human decision. Persisting
// the decision and changing the run's stage must happen atomically in storage.
type PipelineHandoffResult string

const (
	PipelineHandoffAdvance  PipelineHandoffResult = "advance"
	PipelineHandoffRetry    PipelineHandoffResult = "retry"
	PipelineHandoffEscalate PipelineHandoffResult = "escalate"
)

// DecidePipelineHandoff enforces the rejection cap. A rejected stage without
// retry budget needs a human to change the plan; it never advances silently.
func DecidePipelineHandoff(stage PipelineStage, priorRejections int, decision PipelineHandoffDecision) (PipelineHandoffResult, error) {
	if !stage.RequiresApproval {
		return "", errors.New("stage has no approval gate")
	}
	if priorRejections < 0 {
		return "", errors.New("prior rejections cannot be negative")
	}
	switch decision {
	case PipelineHandoffAccept:
		return PipelineHandoffAdvance, nil
	case PipelineHandoffReject:
		if priorRejections < stage.MaxRejections {
			return PipelineHandoffRetry, nil
		}
		return PipelineHandoffEscalate, nil
	default:
		return "", fmt.Errorf("unsupported handoff decision %q", decision)
	}
}
