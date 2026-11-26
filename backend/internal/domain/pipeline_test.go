package domain

import (
	"strings"
	"testing"
)

func validPipeline() PipelineDefinition {
	return PipelineDefinition{
		ID: "flow-1", ProjectID: "project-1", Version: 1, Name: "Ship change",
		Stages: []PipelineStage{
			{ID: "plan", Name: "Plan", Mode: PipelineStageManual, Brief: "Write a plan", RequiresApproval: true, MaxRejections: 2},
			{ID: "code", Name: "Code", Mode: PipelineStageAgent, Brief: "Implement the approved plan"},
		},
	}
}

func TestValidatePipelineDefinition(t *testing.T) {
	if err := ValidatePipelineDefinition(validPipeline()); err != nil {
		t.Fatalf("valid pipeline: %v", err)
	}
	tests := []struct {
		name string
		edit func(*PipelineDefinition)
		want string
	}{
		{"missing stages", func(d *PipelineDefinition) { d.Stages = nil }, "at least one stage"},
		{"duplicate stage", func(d *PipelineDefinition) { d.Stages[1].ID = "plan" }, "duplicate stage ID"},
		{"unknown mode", func(d *PipelineDefinition) { d.Stages[1].Mode = "unknown" }, "unsupported mode"},
		{"empty brief", func(d *PipelineDefinition) { d.Stages[1].Brief = " " }, "requires a brief"},
		{"retry without gate", func(d *PipelineDefinition) { d.Stages[1].MaxRejections = 1 }, "without an approval gate"},
		{"excess retry", func(d *PipelineDefinition) { d.Stages[0].MaxRejections = MaxPipelineRejections + 1 }, "max rejections"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			def := validPipeline()
			tc.edit(&def)
			if err := ValidatePipelineDefinition(def); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("got error %v, want %q", err, tc.want)
			}
		})
	}
}

func TestDecidePipelineHandoff(t *testing.T) {
	stage := validPipeline().Stages[0]
	for _, tc := range []struct {
		prior    int
		decision PipelineHandoffDecision
		want     PipelineHandoffResult
	}{
		{0, PipelineHandoffReject, PipelineHandoffRetry},
		{1, PipelineHandoffReject, PipelineHandoffRetry},
		{2, PipelineHandoffReject, PipelineHandoffEscalate},
		{0, PipelineHandoffAccept, PipelineHandoffAdvance},
	} {
		got, err := DecidePipelineHandoff(stage, tc.prior, tc.decision)
		if err != nil || got != tc.want {
			t.Fatalf("prior=%d decision=%s: got %s, %v; want %s", tc.prior, tc.decision, got, err, tc.want)
		}
	}
	stage.RequiresApproval = false
	if _, err := DecidePipelineHandoff(stage, 0, PipelineHandoffAccept); err == nil {
		t.Fatal("handoff without approval gate accepted")
	}
}
