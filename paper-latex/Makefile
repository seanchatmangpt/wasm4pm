LATEX=lualatex
LATEXMK=latexmk
LATEXMK_OPTS=-lualatex -interaction=nonstopmode -halt-on-error -file-line-error -outdir=build

all: pdf

pdf:
	$(LATEXMK) $(LATEXMK_OPTS) main.tex

clean:
	$(LATEXMK) -C -outdir=build
	rm -rf build/*

.PHONY: all pdf clean
