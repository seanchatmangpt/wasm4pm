all: main.pdf

main.pdf: main.tex chapters/*.tex
	pdflatex -interaction=nonstopmode main.tex
	pdflatex -interaction=nonstopmode main.tex

clean:
	rm -f *.aux *.log *.out *.toc *.lof *.lot main.pdf chapters/*.aux
